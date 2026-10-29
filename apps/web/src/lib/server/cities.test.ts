import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '#lib/contrail.config.js';
import { TOP_CITIES_LIMIT } from '#lib/cities.js';
import { cityConditions, readTopCities } from './cities';

const NOW = '2026-10-28T12:00:00.000Z';
const FUTURE = '2026-11-15T12:00:00.000Z';
const PAST = '2026-10-27T12:00:00.000Z';
const databases: DatabaseSync[] = [];
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	for (const db of databases.splice(0)) db.close();
});
const address = (locality: unknown, country: unknown = 'DE', region: unknown = '') => ({
	$type: 'community.lexicon.location.address',
	locality,
	country,
	region
});

// Real SQLite JSON1, not assertions against mock SQL strings. Both the aggregate
// and the actual Contrail pipeline's WHERE clauses execute against these records.
function setup() {
	const sqlite = new DatabaseSync(':memory:');
	databases.push(sqlite);
	sqlite.exec('CREATE TABLE records_event (uri TEXT PRIMARY KEY, record TEXT NOT NULL)');
	function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
		return {
			bind: (...values: SQLInputValue[]) => prepare(sql, values),
			all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) })
		} as unknown as D1PreparedStatement;
	}
	const db = { prepare } as D1Database;
	let sequence = 0;
	function add(record: Record<string, unknown>) {
		const uri = `at://did:plc:test/community.lexicon.calendar.event/${++sequence}`;
		sqlite
			.prepare('INSERT INTO records_event VALUES (?, ?)')
			.run(uri, JSON.stringify({ startsAt: FUTURE, ...record }));
		return uri;
	}
	async function matching(scope: { city: string; country: string; region: string }) {
		const handler = config.collections!.event.pipelineQueries!.listDiscoverableInCity;
		const source = await handler(db, new URLSearchParams(scope), config);
		return sqlite
			.prepare(
				`SELECT r.uri FROM records_event r WHERE ${source.conditions!.join(' AND ')}
			AND json_extract(r.record, '$.startsAt') >= ? ORDER BY r.uri`
			)
			.all(...((source.params ?? []) as SQLInputValue[]), NOW)
			.map((row) => row.uri);
	}
	return { db, sqlite, add, matching };
}

describe('existing-field city discovery', () => {
	it('counts only upcoming, discoverable, non-virtual events; needs no endsAt', async () => {
		const { db, add } = setup();
		add({ locations: [address('Berlin')] });
		add({ locations: [address('Berlin')], startsAt: NOW });
		add({ locations: [address('Berlin')], startsAt: PAST });
		add({ locations: [address('Berlin')], startsAt: PAST, endsAt: FUTURE }); // ongoing is not upcoming
		add({ locations: [address('Berlin')], startsAt: null });
		add({ locations: [address('Berlin')], preferences: { showInDiscovery: false } });
		add({ locations: [address('Berlin')], preferences: { showInDiscovery: 0 } });
		add({ locations: [address('Berlin')], preferences: { showInDiscovery: null } });
		add({ locations: [address('Berlin')], mode: 'community.lexicon.calendar.event#virtual' });
		add({ locations: [address('Berlin')], mode: 'virtual' });
		add({ locations: [address('Berlin')], mode: 'community.lexicon.calendar.event#hybrid' });
		expect(await readTopCities(db, NOW)).toEqual([
			{ city: 'Berlin', country: 'DE', region: '', count: 4 }
		]);
	});

	it('normalizes basic case and spaces, counts an event once per city, and agrees with the pipeline', async () => {
		const { db, add, matching } = setup();
		const one = add({ locations: [address(' Berlin ', ' DE '), address('BERLIN', 'de')] });
		const two = add({ locations: [address('Berlin', 'DE'), address('Paris', 'FR')] });
		const three = add({ locations: [address('berlin', 'de')] });
		add({ locations: [address('Berlin')], preferences: { showInDiscovery: false } });
		const cities = await readTopCities(db, NOW);
		expect(cities.map(({ city, count }) => [city.toLowerCase(), count])).toEqual([
			['berlin', 3],
			['paris', 1]
		]);
		for (const city of cities) expect(await matching(city)).toHaveLength(city.count);
		expect(await matching({ city: ' BERLIN ', country: 'de', region: '' })).toEqual([
			one,
			two,
			three
		]);
	});

	it('keeps countries and regions separate and never combines fields from different addresses', async () => {
		const { db, add, matching } = setup();
		add({ locations: [address('Springfield', 'US', 'IL')] });
		add({ locations: [address('Springfield', 'US', 'MA')] });
		add({ locations: [address('Springfield', 'CA', 'NS')] });
		add({ locations: [address('Springfield', 'US'), address('Other', 'CA', 'NS')] });
		const cities = await readTopCities(db, NOW);
		expect(cities.filter(({ city }) => city === 'Springfield')).toHaveLength(4);
		expect(await matching({ city: 'Springfield', country: 'US', region: 'NS' })).toEqual([]);
		for (const city of cities) expect(await matching(city)).toHaveLength(city.count);
	});

	it('uses only supplied localities, including untyped legacy addresses; does not infer names or coordinates', async () => {
		const { db, add } = setup();
		add({ locations: [{ locality: 'Legacy City' }] });
		add({ locations: [address('Known City', null, 42)] });
		add({
			locations: [
				{
					$type: 'community.lexicon.location.geo',
					locality: 'Not an address',
					latitude: 52,
					longitude: 13
				}
			]
		});
		add({ locations: [{ $type: 'community.lexicon.location.hthree', name: 'Berlin', h3: 'x' }] });
		add({ locations: [{ name: 'Berlin', street: 'Berlin, Germany' }] });
		add({ locations: [address('')] });
		add({ locations: [address('   ')] });
		add({ locations: [address(42)] });
		add({ locations: ['not an object', 3, null, []] });
		add({ locations: { locality: 'Not an array' } });
		add({ locations: 'Berlin' });
		add({ locations: null });
		add({});
		expect(await readTopCities(db, NOW)).toEqual([
			{ city: 'Known City', country: '', region: '', count: 1 },
			{ city: 'Legacy City', country: '', region: '', count: 1 }
		]);
	});

	it('returns only the top 20 with stable tie-breaking and no zero-count cities', async () => {
		const { db, add } = setup();
		for (let i = 0; i < 25; i++)
			add({ locations: [address(`City ${String(i).padStart(2, '0')}`)] });
		add({ locations: [address('City 24')] });
		add({ locations: [address('Ended City')], startsAt: PAST });
		const cities = await readTopCities(db, NOW);
		expect(cities).toHaveLength(TOP_CITIES_LIMIT);
		expect(cities[0]).toMatchObject({ city: 'City 24', count: 2 });
		expect(cities.slice(1).map(({ city }) => city)).toEqual(
			Array.from({ length: 19 }, (_, i) => `City ${String(i).padStart(2, '0')}`)
		);
	});

	it('binds arbitrary city input rather than interpolating SQL and fails closed for an empty city', async () => {
		const { db, add, matching } = setup();
		const city = "O'Fallon'); DROP TABLE records_event; --";
		const uri = add({ locations: [address(city, 'US', 'IL')] });
		expect(await matching({ city, country: 'US', region: 'IL' })).toEqual([uri]);
		const source = await cityConditions(db, { city, country: 'US', region: 'IL' });
		expect(source.conditions.join(' ')).not.toContain(city);
		expect(JSON.parse(source.params[0])).toEqual([[city, 'US', 'IL']]);
		expect(await matching({ city: ' ', country: 'US', region: '' })).toEqual([]);
	});

	it('merges the Boulder screenshot variants before ranking, and listings contain their union exactly once', async () => {
		const { db, add, matching } = setup();
		const one = add({
			locations: [address('Boulder', 'US', 'CO'), address('Boulder', 'US', 'Colorado')]
		});
		const two = add({ locations: [address('Boulder, Colorado, 80302', 'USA', 'CO')] });
		const three = add({ locations: [address('Boulder, Colorado, 80304', 'United States', 'CO')] });
		const four = add({ locations: [address('Boulder, CO, 80302', 'US')] });
		const five = add({ locations: [address('Boulder', 'US')] });
		add({ locations: [address('Unrelated', 'US', 'CO')] });
		const cities = await readTopCities(db, NOW);
		expect(cities[0]).toEqual({ city: 'Boulder', country: 'US', region: 'Colorado', count: 5 });
		expect(cities.filter((city) => city.city.toLowerCase().includes('boulder'))).toHaveLength(1);
		expect(await matching(cities[0])).toEqual([one, two, three, four, five]);
		// Existing URLs using raw country/region/address variants still work.
		expect(
			await matching({ city: 'Boulder, Colorado, 80302', country: 'USA', region: 'CO' })
		).toHaveLength(5);
		expect(await matching({ city: 'Boulder', country: 'US', region: '' })).toHaveLength(5);
	});

	it('merges country labels, Unicode case and unambiguous missing regions, but keeps genuinely different places separate', async () => {
		const { db, add, matching } = setup();
		add({ locations: [address('Bengaluru', 'IN')] });
		add({ locations: [address('Bengaluru', 'India', 'Karnataka')] });
		add({ locations: [address('Amsterdam', 'Nederland', 'Noord-Holland')] });
		add({ locations: [address('Amsterdam', 'NL', 'North Holland')] });
		add({ locations: [address('Amsterdam', 'NL')] });
		add({ locations: [address('Stockholm', 'SE', 'Stockholms län')] });
		add({ locations: [address('Stockholm', 'Sweden')] });
		add({ locations: [address('MÜNCHEN', 'DE')] });
		add({ locations: [address('München', 'Germany')] });
		add({ locations: [address('Springfield', 'US', 'IL')] });
		add({ locations: [address('Springfield', 'US', 'MA')] });
		add({ locations: [address('Springfield', 'US')] }); // unknown, must not attach to either
		add({ locations: [address('Stockholm', 'US', 'ME')] }); // same name, different country
		const cities = await readTopCities(db, NOW);
		expect(cities.find((city) => city.city === 'Amsterdam')).toMatchObject({
			country: 'NL',
			region: 'Noord-Holland',
			count: 3
		});
		expect(cities.find((city) => city.city === 'Bengaluru')).toMatchObject({
			country: 'IN',
			region: 'Karnataka',
			count: 2
		});
		expect(cities.filter((city) => city.city === 'Springfield')).toHaveLength(3);
		expect(cities.filter((city) => city.city === 'Stockholm')).toHaveLength(2);
		expect(cities.find((city) => city.city === 'München')?.count).toBe(2);
		for (const city of cities) expect(await matching(city)).toHaveLength(city.count);
		expect(await matching({ city: 'Springfield', country: 'US', region: '' })).toHaveLength(1);
	});

	it('applies top-20 AFTER merging variants, not before', async () => {
		const { db, add } = setup();
		for (let i = 0; i < 20; i++) {
			add({ locations: [address(`Other ${i}`)] });
			add({ locations: [address(`Other ${i}`)] });
		}
		for (const raw of ['Boulder', 'Boulder, CO, 80302', 'Boulder, Colorado, 80304'])
			add({ locations: [address(raw, 'US', 'CO')] });
		const cities = await readTopCities(db, NOW);
		expect(cities).toHaveLength(20);
		expect(cities[0]).toMatchObject({ city: 'Boulder', count: 3 });
	});

	it('shares one compact read cache between ranking and listings; does not cache event URIs', async () => {
		const { db, add, matching } = setup();
		const memory = new Map<string, Response>();
		vi.stubGlobal('caches', {
			default: {
				match: async (key: Request) => memory.get(key.url)?.clone(),
				put: async (key: Request, value: Response) => {
					memory.set(key.url, value.clone());
				}
			}
		});
		add({ locations: [address('Boulder', 'US', 'CO')] });
		const prepare = vi.spyOn(db, 'prepare');
		const cities = await readTopCities(db);
		expect(await matching(cities[0])).toHaveLength(1);
		expect(prepare).toHaveBeenCalledTimes(1); // pipeline reused ranking's catalog
		const cached = [...memory.values()][0];
		expect(cached.headers.get('cache-control')).toBe('max-age=300');
		expect(await cached.clone().text()).not.toContain('at://');
		add({ locations: [address('Boulder, Colorado, 80302', 'USA')] });
		expect((await readTopCities(db))[0].count).toBe(1);
		memory.clear(); // next miss sees the new publisher variant, no backfill
		expect((await readTopCities(db))[0].count).toBe(2);
		expect(await matching(cities[0])).toHaveLength(2);
	});

	it('reflects updates, deletes and time passing without a backfill or enrichment writes', async () => {
		const { db, sqlite, add } = setup();
		const uri = add({ locations: [address('Berlin')] });
		expect((await readTopCities(db, NOW))[0].city).toBe('Berlin');
		sqlite
			.prepare('UPDATE records_event SET record = ? WHERE uri = ?')
			.run(JSON.stringify({ startsAt: FUTURE, locations: [address('Paris', 'FR')] }), uri);
		expect((await readTopCities(db, NOW))[0].city).toBe('Paris');
		expect(await readTopCities(db, '2027-01-01T00:00:00.000Z')).toEqual([]);
		sqlite.prepare('DELETE FROM records_event WHERE uri = ?').run(uri);
		expect(await readTopCities(db, NOW)).toEqual([]);
		expect(
			sqlite
				.prepare("SELECT name FROM sqlite_master WHERE type='table'")
				.all()
				.map(({ name }) => name)
		).toEqual(['records_event']);
	});
});
