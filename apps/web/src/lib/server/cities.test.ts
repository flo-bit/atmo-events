import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { latLngToCell } from 'h3-js';
import { config } from '#lib/contrail.config.js';
import type { Database } from '@atmo-dev/contrail';
import {
	buildCatalog,
	cityConditions,
	readCityCatalog,
	readNearbyPage,
	readCitySnapshot,
	refreshCitySnapshot,
	CITY_SNAPSHOT_INTERVAL_MS,
	CITY_SNAPSHOT_RETENTION_MS,
	NEARBY_RADIUS_KM,
	NEARBY_CANDIDATE_LIMIT
} from './cities';

const NOW = '2026-10-28T12:00:00.000Z';
const FUTURE = '2026-11-15T12:00:00.000Z';
const PAST = '2026-10-27T12:00:00.000Z';
const databases: DatabaseSync[] = [];
// Ranked catalog as stored in the snapshot, or built directly for a given time.
async function readTopCities(db: Database, asOf?: string) {
	const cities = asOf ? await buildCatalog(db, asOf) : await readCityCatalog(db);
	if (!cities) throw new Error('City snapshot is not available yet');
	return cities.map(({ city, country, region, count }) => ({ city, country, region, count }));
}
// Nearby event cities for a visitor at a point outside the gazetteer.
async function nearbyTo(db: Database, latitude: string, longitude: string) {
	const page = await readNearbyPage(db, { city: 'Nowhere', country: 'DE', latitude, longitude });
	return page.nearby.map(({ city }) => city.city);
}
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
	sqlite.exec(`
		CREATE TABLE records_event (uri TEXT PRIMARY KEY, record TEXT NOT NULL,
			did TEXT NOT NULL DEFAULT 'did:plc:test', cid TEXT DEFAULT 'cid');
		CREATE TABLE moderation_hidden (subject TEXT, cid TEXT, starts_at INTEGER, exp INTEGER);
	`);
	const bound = new WeakMap<D1PreparedStatement, { sql: string; params: SQLInputValue[] }>();
	function execute(sql: string, params: SQLInputValue[]) {
		const statement = sqlite.prepare(sql);
		return statement.columns().length
			? { success: true, results: statement.all(...params), meta: { changes: 0 } }
			: { success: true, results: [], meta: { changes: Number(statement.run(...params).changes) } };
	}
	function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
		const statement = {
			bind: (...values: SQLInputValue[]) => prepare(sql, values),
			all: async () => execute(sql, params),
			run: async () => execute(sql, params),
			first: async () => sqlite.prepare(sql).get(...params) ?? null
		} as unknown as D1PreparedStatement;
		bound.set(statement, { sql, params });
		return statement;
	}
	const db = {
		prepare,
		batch: async (statements: D1PreparedStatement[]) => {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement) => {
					const { sql, params } = bound.get(statement)!;
					return execute(sql, params);
				});
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	} as unknown as D1Database;
	let sequence = 0;
	function add(record: Record<string, unknown>) {
		const uri = `at://did:plc:test/community.lexicon.calendar.event/${++sequence}`;
		sqlite
			.prepare('INSERT INTO records_event (uri, record) VALUES (?, ?)')
			.run(uri, JSON.stringify({ startsAt: FUTURE, ...record }));
		return uri;
	}
	async function matching(
		scope: { city: string; country: string; region: string },
		uris?: string[],
		snapshot?: string
	) {
		await refreshCitySnapshot(db);
		const handler = config.collections!.event.pipelineQueries!.listDiscoverableInCity;
		const params = new URLSearchParams(scope);
		if (uris) params.set('uris', uris.join(','));
		if (snapshot) params.set('snapshot', snapshot);
		const source = await handler(db, params, config);
		return sqlite
			.prepare(
				`SELECT r.uri FROM records_event r WHERE ${source.conditions!.join(' AND ')} ORDER BY r.uri`
			)
			.all(...((source.params ?? []) as SQLInputValue[]))
			.map((row) => row.uri);
	}
	return { db, sqlite, add, matching };
}

describe('existing-field city discovery', () => {
	it('excludes hidden records and accounts from city aggregates', async () => {
		const { db, sqlite, add } = setup();
		add({ locations: [address('Berlin')] });
		const hidden = add({ locations: [address('Hidden City')] });
		const hiddenAccount = add({ locations: [address('Hidden Host City')] });
		sqlite
			.prepare('UPDATE records_event SET did = ? WHERE uri = ?')
			.run('did:plc:hidden', hiddenAccount);
		const hide = sqlite.prepare('INSERT INTO moderation_hidden (subject, cid) VALUES (?, ?)');
		hide.run(hidden, '');
		hide.run('did:plc:hidden', '');
		expect(await readTopCities(db, NOW)).toEqual([
			{ city: 'Berlin', country: 'DE', region: '', count: 1 }
		]);
	});
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

	it('compares instants with offsets, normalizes snapshot ordering and excludes cancelled events', async () => {
		const { db, add, matching } = setup();
		const later = add({ locations: [address('Berlin')], startsAt: '2026-10-28T08:00:00-05:00' });
		const sooner = add({ locations: [address('Berlin')], startsAt: '2026-10-28T14:30:00+02:00' });
		add({ locations: [address('Berlin')], startsAt: '2026-10-28T13:00:00+02:00' });
		add({ locations: [address('Berlin')], startsAt: 'invalid' });
		for (const status of ['community.lexicon.calendar.event#cancelled', 'cancelled', 'canceled'])
			add({ locations: [address('Berlin')], status });
		await refreshCitySnapshot(db);
		expect(await matching({ city: 'Berlin', country: 'DE', region: '' })).toEqual([later, sooner]);
		expect(
			(await readCitySnapshot(db, { city: 'Berlin', country: 'DE', region: '' }))?.events
		).toEqual([
			[sooner, '2026-10-28T12:30:00.000Z'],
			[later, '2026-10-28T13:00:00.000Z']
		]);
	});

	it('publishes newly indexed membership within one refresh interval without changing old cursors', async () => {
		const { db, add } = setup();
		const scope = { city: 'Berlin', country: 'DE', region: '' };
		add({ locations: [address('Berlin')] });
		await refreshCitySnapshot(db);
		const original = (await readCitySnapshot(db, scope))!;
		const added = add({ locations: [address('Berlin')] });
		await refreshCitySnapshot(db, Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS - 1);
		expect((await readCitySnapshot(db, scope))?.events).toHaveLength(1);
		await refreshCitySnapshot(db, Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS);
		expect((await readCitySnapshot(db, scope))?.events.map(([uri]) => uri)).toContain(added);
		expect(await readCitySnapshot(db, scope, original.version)).toEqual(original);
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

	it('finds nearby cities across borders within the radius', async () => {
		const { db, add } = setup();
		const geo = (latitude: unknown, longitude: unknown) => ({
			$type: 'community.lexicon.location.geo',
			latitude,
			longitude
		});
		add({ locations: [address('Berlin'), geo('52.52', '13.405')] });
		add({ locations: [address('Berlin'), geo('52.52', '13.405')] });
		add({ locations: [address('Szczecin', 'PL'), geo('53.43', '14.55')] });
		add({ locations: [address('Munich'), geo('48.14', '11.58')] });
		add({ locations: [address('Sampletown'), geo('', '13')] });
		add({ locations: [address('Ambiguous'), address('Other'), geo('52.52', '13.405')] });
		await refreshCitySnapshot(db);
		expect(await nearbyTo(db, '52.52', '13.405')).toEqual(['Berlin', 'Szczecin']);
		expect(await nearbyTo(db, '', '')).toEqual([]);
	});

	it('does not guess coordinates for multiple locations or conflicting city points', async () => {
		const { db, add } = setup();
		const geo = (latitude: string, longitude: string) => ({
			$type: 'community.lexicon.location.geo',
			latitude,
			longitude
		});
		add({ locations: [address('Multi Geo'), geo('52.52', '13.405'), geo('48.14', '11.58')] });
		add({ locations: [address('Multi Address'), address(''), geo('52.52', '13.405')] });
		add({ locations: [address('Conflicting'), geo('52.52', '13.405')] });
		add({ locations: [address('Conflicting'), geo('40.713', '-74.006')] });
		add({ locations: [address('Agreement'), geo('52.52', '13.405')] });
		add({ locations: [address('Agreement'), geo('52.53', '13.41')] });
		await refreshCitySnapshot(db);
		expect(await nearbyTo(db, '52.52', '13.405')).toEqual(['Agreement']);
	});

	it('uses sufficiently precise H3 cells but not malformed, coarse, or ambiguous locations', async () => {
		const { db, add } = setup();
		const h3 = (value: string) => ({ $type: 'community.lexicon.location.hthree', value });
		add({ locations: [address('Precise'), h3(latLngToCell(52.52, 13.405, 7))] });
		add({ locations: [address('Coarse'), h3(latLngToCell(52.52, 13.405, 2))] });
		add({ locations: [address('Invalid'), h3('not-a-cell')] });
		add({
			locations: [
				address('Ambiguous Formats'),
				h3(latLngToCell(52.52, 13.405, 7)),
				{
					$type: 'community.lexicon.location.geo',
					latitude: '52.52',
					longitude: '13.405'
				}
			]
		});
		await refreshCitySnapshot(db);
		expect(await nearbyTo(db, '52.52', '13.405')).toEqual(['Precise']);
	});

	it('calculates the radius boundary and wraps across the date line', async () => {
		const { db, add } = setup();
		const addPoint = (city: string, latitude: string, longitude: string) =>
			add({
				locations: [address(city), { $type: 'community.lexicon.location.geo', latitude, longitude }]
			});
		// One degree of longitude at the equator is ~111.19 km.
		const edge = NEARBY_RADIUS_KM / 111.19;
		addPoint('Inside', '0', (edge - 0.01).toFixed(2));
		addPoint('Outside', '0', (edge + 0.01).toFixed(2));
		addPoint('Date Line', '0', '-179.5');
		await refreshCitySnapshot(db);
		expect(await nearbyTo(db, '0', '0')).toEqual(['Inside']);
		expect(await nearbyTo(db, '0', '179.5')).toEqual(['Date Line']);
	});

	it('finds the IP city and the nearest event city even when event addresses lack coordinates', async () => {
		const { db, add } = setup();
		add({ locations: [address('Berlin')] });
		add({ locations: [address('Leipzig', 'DE', 'Saxony')] });
		add({ locations: [address('Paris', 'FR')] });
		await refreshCitySnapshot(db);
		const berlin = await readNearbyPage(db, {
			city: 'Berlin',
			country: 'DE',
			region: 'Berlin',
			latitude: '52.52',
			longitude: '13.405'
		});
		expect(berlin.matched?.city).toBe('Berlin');
		expect(berlin.nearby.map(({ city }) => city.city)).toEqual(['Leipzig']);
		expect(berlin.nearby[0].distanceKm).toBeGreaterThan(100);
		expect(berlin.nearby[0].distanceKm).toBeLessThan(200);
		const potsdam = await readNearbyPage(db, {
			city: 'Potsdam',
			country: 'DE',
			region: 'Brandenburg',
			latitude: '52.39',
			longitude: '13.06'
		});
		expect(potsdam.matched).toBeNull();
		expect(potsdam.nearby[0].city.city).toBe('Berlin');
		expect((await readNearbyPage(db, undefined, 'leip')).cities.map((c) => c.city)).toContain(
			'Leipzig'
		);
		// The picker can select a city with no events, not just catalog entries.
		expect((await readNearbyPage(db, undefined, 'potsdam')).cities.map((c) => c.city)).toContain(
			'Potsdam'
		);
	});

	it('matches unambiguous missing regions and known local names without inventing a place', async () => {
		const { db, add } = setup();
		add({ locations: [address('Berlin', 'DE', 'Berlin')] });
		add({ locations: [address('München', 'DE', 'Bayern')] });
		add({ locations: [address('Munich', 'DE', 'Bavaria')] });
		add({ locations: [address('Springfield', 'US')] });
		await refreshCitySnapshot(db);
		expect((await readNearbyPage(db, { city: 'Berlin', country: 'DE' })).matched?.city).toBe(
			'Berlin'
		);
		expect(
			(await readNearbyPage(db, { city: 'Berlin', country: 'DE', regionCode: 'BE' })).matched?.city
		).toBe('Berlin');
		const munich = await readNearbyPage(db, { city: 'Munich', country: 'DE', region: 'Bavaria' });
		expect(munich.matched?.count).toBe(2);
		expect((await readNearbyPage(db, undefined, 'münchen')).cities).toContainEqual(
			expect.objectContaining({ count: 2 })
		);
		expect(
			(await readNearbyPage(db, { city: 'Springfield', country: 'US', region: 'MA' })).matched
		).toBeNull();
		expect((await readNearbyPage(db, { city: 'Springfield', country: 'US' })).matched).toBeNull();
	});

	it('allows explicit countryless catalog choices but never infers an IP location from them', async () => {
		const { db, add } = setup();
		const scope = { city: 'Legacy City', country: '', region: '' };
		add({ locations: [address(scope.city, '')] });
		await refreshCitySnapshot(db);
		expect((await readNearbyPage(db, scope)).detected).toBeNull();
		const selected = await readNearbyPage(db, scope, '', { explicit: true });
		expect(selected.detected).toEqual(scope);
		expect(selected.matched?.count).toBe(1);
		expect(selected.nearby).toEqual([]);
		expect(
			(await readNearbyPage(db, { ...scope, city: 'Invented' }, '', { explicit: true })).detected
		).toBeNull();
	});

	it('returns only a bounded distance-ordered set of nearby candidates, including across borders', async () => {
		const { db, add } = setup();
		for (let i = 7; i >= 1; i--)
			add({
				locations: [
					address(`Nearby ${i}`, i === 1 ? 'PL' : 'DE'),
					{ $type: 'community.lexicon.location.geo', latitude: '0', longitude: String(i / 10) }
				]
			});
		await refreshCitySnapshot(db);
		const result = await readNearbyPage(db, {
			city: 'Origin',
			country: 'DE',
			latitude: '0',
			longitude: '0'
		});
		expect(result.nearby.map(({ city }) => city.city)).toEqual([
			'Nearby 1',
			'Nearby 2',
			'Nearby 3',
			'Nearby 4',
			'Nearby 5'
		]);
		expect(result.nearby).toHaveLength(NEARBY_CANDIDATE_LIMIT);
		expect(result.nearby.every(({ distanceKm }) => distanceKm <= NEARBY_RADIUS_KM)).toBe(true);
	});

	it('enforces the radius boundary and wraps distance across the date line', async () => {
		const { db, add } = setup();
		for (const [city, longitude] of [
			['Inside', '1.79'],
			['Outside', '1.81'],
			['Date Line', '-179.8']
		]) {
			add({
				locations: [
					address(city),
					{ $type: 'community.lexicon.location.geo', latitude: '0', longitude }
				]
			});
		}
		await refreshCitySnapshot(db);
		const location = { city: 'Origin', country: 'DE', latitude: '0', longitude: '0' };
		expect((await readNearbyPage(db, location)).nearby.map(({ city }) => city.city)).toEqual([
			'Inside'
		]);
		expect(
			(await readNearbyPage(db, { ...location, longitude: '179.8' })).nearby.map(
				({ city }) => city.city
			)
		).toEqual(['Date Line']);
	});

	it('prefers a known city center over misleading publisher coordinates', async () => {
		const { db, add } = setup();
		add({
			locations: [
				address('Berlin'),
				{ $type: 'community.lexicon.location.geo', latitude: '40.7', longitude: '-74' }
			]
		});
		await refreshCitySnapshot(db);
		expect(
			(
				await readNearbyPage(db, {
					city: 'New York City',
					country: 'US',
					latitude: '40.7',
					longitude: '-74'
				})
			).nearby
		).toEqual([]);
	});

	it('does not describe a distant event city as nearby', async () => {
		const { db, add } = setup();
		add({ locations: [address('Berlin')] });
		await refreshCitySnapshot(db);
		expect(
			(
				await readNearbyPage(db, {
					city: 'New York City',
					country: 'US',
					latitude: '40.7',
					longitude: '-74'
				})
			).nearby
		).toEqual([]);
	});

	it('does not confuse same-named cities in different regions', async () => {
		const { db, add } = setup();
		add({ locations: [address('Springfield', 'US', 'IL')] });
		add({ locations: [address('Springfield', 'US', 'MA')] });
		await refreshCitySnapshot(db);
		const massachusetts = await readNearbyPage(db, {
			city: 'Springfield',
			country: 'US',
			region: 'Massachusetts',
			latitude: '42.1',
			longitude: '-72.6'
		});
		expect(massachusetts.matched?.region).toBe('Massachusetts');
		expect(
			(
				await readNearbyPage(db, {
					city: 'Springfield',
					country: 'US',
					region: '',
					regionCode: 'MA'
				})
			).matched?.region
		).toBe('Massachusetts');
		const ambiguous = await readNearbyPage(db, { city: 'Springfield', country: 'US' });
		expect(ambiguous.matched).toBeNull();
	});

	it('searches the entire catalog for nearby cities rather than only the worldwide top 20', async () => {
		const { db, add } = setup();
		for (let i = 0; i < 21; i++) {
			add({ locations: [address(`Popular ${i}`, 'US')] });
			add({ locations: [address(`Popular ${i}`, 'US')] });
		}
		add({
			locations: [
				address('Local', 'DE'),
				{ $type: 'community.lexicon.location.geo', latitude: '52.5', longitude: '13.4' }
			]
		});
		await refreshCitySnapshot(db);
		expect((await readTopCities(db)).slice(0, 20).some((city) => city.city === 'Local')).toBe(
			false
		);
		expect(await nearbyTo(db, '52.5', '13.4')).toEqual(['Local']);
	});

	it('ranks by count with stable tie-breaking and no zero-count cities', async () => {
		const { db, add } = setup();
		for (let i = 0; i < 25; i++)
			add({ locations: [address(`City ${String(i).padStart(2, '0')}`)] });
		add({ locations: [address('City 24')] });
		add({ locations: [address('Ended City')], startsAt: PAST });
		const cities = await readTopCities(db, NOW);
		expect(cities).toHaveLength(25);
		expect(cities[0]).toMatchObject({ city: 'City 24', count: 2 });
		expect(cities.slice(1).map(({ city }) => city)).toEqual(
			Array.from({ length: 24 }, (_, i) => `City ${String(i).padStart(2, '0')}`)
		);
	});

	it('binds arbitrary city input rather than interpolating SQL and fails closed for an empty city', async () => {
		const { db, add, matching } = setup();
		const city = "O'Fallon'); DROP TABLE records_event; --";
		const uri = add({ locations: [address(city, 'US', 'IL')] });
		expect(await matching({ city, country: 'US', region: 'IL' })).toEqual([uri]);
		const source = await cityConditions(db, { city, country: 'US', region: 'IL' });
		expect(source.conditions.join(' ')).not.toContain(city);
		expect(JSON.parse(source.params[1])).toEqual([[city, 'US', 'IL']]);
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

	it('ranks AFTER merging variants, not before', async () => {
		const { db, add } = setup();
		for (let i = 0; i < 20; i++) {
			add({ locations: [address(`Other ${i}`)] });
			add({ locations: [address(`Other ${i}`)] });
		}
		for (const raw of ['Boulder', 'Boulder, CO, 80302', 'Boulder, Colorado, 80304'])
			add({ locations: [address(raw, 'US', 'CO')] });
		const cities = await readTopCities(db, NOW);
		expect(cities).toHaveLength(21);
		expect(cities[0]).toMatchObject({ city: 'Boulder', count: 3 });
	});

	it('shares the global snapshot at the edge and refreshes only through cron', async () => {
		const { db, add, matching } = setup();
		const memory = new Map<string, { response: Response; expiresAt: number }>();
		vi.stubGlobal('caches', {
			default: {
				match: async (key: Request) => {
					const entry = memory.get(key.url);
					return entry && entry.expiresAt > Date.now() ? entry.response.clone() : undefined;
				},
				put: async (key: Request, value: Response) => {
					const ttl = Number(value.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]);
					memory.set(key.url, { response: value.clone(), expiresAt: Date.now() + ttl * 1000 });
				}
			}
		});
		add({ locations: [address('Boulder', 'US', 'CO')] });
		await refreshCitySnapshot(db);
		const prepare = vi.spyOn(db, 'prepare');
		const cities = await readTopCities(db);
		expect(prepare).toHaveBeenCalledTimes(2); // head + compact catalog
		const cached = [...memory.values()][1].response;
		expect(cached.headers.get('cache-control')).toBe('max-age=86400');
		expect(await cached.clone().text()).not.toContain('at://');
		// The legacy live pipeline can find new records using a known address.
		// Snapshot membership (used by the page) waits for the bounded refresh.
		add({ locations: [address('Boulder', 'US', 'CO')] });
		add({ locations: [address('Boulder, Colorado, 80302', 'USA')] });
		vi.setSystemTime(new Date(Date.parse(NOW) + 5 * 60 * 1000));
		expect((await readTopCities(db))[0].count).toBe(1);
		expect(await matching(cities[0])).toHaveLength(2);
		vi.setSystemTime(new Date(Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS - 1));
		expect((await readTopCities(db))[0].count).toBe(1);
		vi.setSystemTime(new Date(Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS));
		expect((await readTopCities(db))[0].count).toBe(1); // no request-time rebuild
		await refreshCitySnapshot(db);
		memory.clear(); // another location gets the published global snapshot
		expect((await readTopCities(db))[0].count).toBe(3);
		expect(await matching(cities[0])).toHaveLength(3);
		expect(
			prepare.mock.calls.filter(([sql]) => sql.includes('FROM records_event r,'))
		).toHaveLength(1);
	});

	it('hydrates only supplied primary keys and rechecks hidden, moved, virtual, past and deleted events live', async () => {
		const { db, add, sqlite, matching } = setup();
		const scope = { city: 'Berlin', country: 'DE', region: '' };
		const live = add({ locations: [address('Berlin')] });
		const hidden = add({ locations: [address('Berlin')] });
		const moved = add({ locations: [address('Berlin')] });
		const virtual = add({ locations: [address('Berlin')] });
		const past = add({ locations: [address('Berlin')] });
		const deleted = add({ locations: [address('Berlin')] });
		const outsidePage = add({ locations: [address('Berlin')] });
		const otherCity = add({ locations: [address('Paris', 'FR')] });
		await refreshCitySnapshot(db);
		const snapshot = (await readCitySnapshot(db, scope))!;
		const update = (uri: string, record: Record<string, unknown>) =>
			sqlite
				.prepare('UPDATE records_event SET record = ? WHERE uri = ?')
				.run(JSON.stringify({ startsAt: FUTURE, locations: [address('Berlin')], ...record }), uri);
		update(hidden, { preferences: { showInDiscovery: false } });
		update(moved, { locations: [address('Paris', 'FR')] });
		update(virtual, { mode: 'virtual' });
		update(past, { startsAt: PAST });
		sqlite.prepare('DELETE FROM records_event WHERE uri = ?').run(deleted);
		const uris = snapshot.events.map(([uri]) => uri).filter((uri) => uri !== outsidePage);
		expect(await matching(scope, [...uris, otherCity], snapshot.version)).toEqual([live]);
		expect(await matching(scope, [], snapshot.version)).toEqual([]);
		expect(await matching(scope, [live], 'invalid')).toEqual([]);
		const handler = config.collections!.event.pipelineQueries!.listDiscoverableInCity;
		const source = await handler(
			db,
			new URLSearchParams({ ...scope, uris: uris.join(','), snapshot: snapshot.version }),
			config
		);
		const plan = sqlite
			.prepare(
				`EXPLAIN QUERY PLAN SELECT r.uri FROM records_event r WHERE ${source.conditions!.join(' AND ')}`
			)
			.all(...(source.params as SQLInputValue[]));
		expect(plan.some((row) => String(row.detail).includes('(uri=?)'))).toBe(true);
	});

	it('builds once globally per interval, including overlapping cron ticks and reads without an edge cache', async () => {
		const { db, add } = setup();
		add({ locations: [address('Berlin')] });
		const prepare = vi.spyOn(db, 'prepare');
		await Promise.all([refreshCitySnapshot(db), refreshCitySnapshot(db)]);
		await readTopCities(db);
		await readTopCities(db); // another colo / an eviction still reads persisted data
		await refreshCitySnapshot(db, Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS - 1);
		expect(
			prepare.mock.calls.filter(([sql]) => sql.includes('FROM records_event r,'))
		).toHaveLength(1);
		await refreshCitySnapshot(db, Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS);
		expect(
			prepare.mock.calls.filter(([sql]) => sql.includes('FROM records_event r,'))
		).toHaveLength(2);
	});

	it('never scans events on a request before the first cron has published', async () => {
		const { db } = setup();
		const prepare = vi.spyOn(db, 'prepare');
		await expect(readTopCities(db)).rejects.toThrow('not available');
		expect(await readCitySnapshot(db, { city: 'Berlin', country: 'DE', region: '' })).toBeNull();
		expect(prepare.mock.calls.every(([sql]) => !sql.includes('records_event'))).toBe(true);
	});

	it('keeps immutable ordered membership for old cursors, deduplicates aliases and chunks large cities', async () => {
		const { db, add, sqlite } = setup();
		for (let i = 0; i < 1001; i++) add({ locations: [address('Berlin'), address('BERLIN')] });
		await refreshCitySnapshot(db);
		const scope = { city: 'Berlin', country: 'DE', region: '' };
		const old = (await readCitySnapshot(db, scope))!;
		expect(old.events).toHaveLength(1001);
		expect(old.events).toEqual([...old.events].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
		expect(
			sqlite.prepare("SELECT count(*) AS n FROM city_snapshot_data WHERE city_key != ''").get()?.n
		).toBe(2);
		add({ locations: [address('Berlin')] });
		await refreshCitySnapshot(db, Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS);
		expect((await readCitySnapshot(db, scope))!.events).toHaveLength(1002);
		expect(await readCitySnapshot(db, scope, old.version)).toEqual(old);
		expect(await readCitySnapshot(db, scope, 'invalid')).toBeNull();
		await refreshCitySnapshot(
			db,
			Date.parse(NOW) + CITY_SNAPSHOT_RETENTION_MS + CITY_SNAPSHOT_INTERVAL_MS
		);
		expect(await readCitySnapshot(db, scope, old.version)).toBeNull();
	});

	it('preserves the published snapshot on failure and retries after releasing the lease', async () => {
		const { db, add, sqlite } = setup();
		add({ locations: [address('Berlin')] });
		await refreshCitySnapshot(db);
		const before = await readCitySnapshot(db, { city: 'Berlin', country: 'DE', region: '' });
		add({ locations: [address('Paris', 'FR')] });
		// Fail publication AFTER all new payloads have been written. Readers
		// must still see the old version, never an incomplete/unpublished build.
		sqlite.exec(
			"CREATE TRIGGER fail_city BEFORE UPDATE OF version ON city_snapshot_state BEGIN SELECT RAISE(ABORT, 'snapshot failure'); END"
		);
		const later = Date.parse(NOW) + CITY_SNAPSHOT_INTERVAL_MS;
		await expect(refreshCitySnapshot(db, later)).rejects.toThrow('snapshot failure');
		expect(await readCitySnapshot(db, { city: 'Berlin', country: 'DE', region: '' })).toEqual(
			before
		);
		expect(sqlite.prepare('SELECT lease_until FROM city_snapshot_state').get()?.lease_until).toBe(
			0
		);
		sqlite.exec('DROP TRIGGER fail_city');
		await refreshCitySnapshot(db, later + 60_000);
		expect((await readTopCities(db)).map(({ city }) => city)).toEqual(['Berlin', 'Paris']);
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
		).toEqual(['records_event', 'moderation_hidden']);
	});
});
