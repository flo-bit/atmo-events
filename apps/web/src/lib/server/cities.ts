import { visibleRecordSql, type Database } from '@atmo-dev/contrail';
import { cellToLatLng, getResolution, isValidCell } from 'h3-js';
import { TOP_CITIES_LIMIT, type City, type CityScope } from '#lib/cities.js';
import { discoverableSql } from '#lib/contrail/discoverability.js';
import { countryCode, normalizeCityAddress } from './city-normalization';
import { cachedRead } from './edge-cache';
import { normalizeCityField } from '#lib/cities.js';

export const CITY_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const RETENTION_MS = 3 * CITY_SNAPSHOT_INTERVAL_MS;
const CHUNK_CHARACTERS = 64 * 1024; // At most 256 KB UTF-8, below D1's 2 MB value limit.
const DEFINITION = 'cities:v3';
const VERSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCATIONS = `json_each(CASE WHEN json_type(r.record, '$.locations') = 'array'
	THEN json_extract(r.record, '$.locations') ELSE '[]' END) l`;
const ADDRESS = `CASE WHEN l.type = 'object' THEN l.value ELSE '{}' END`;
const field = (name: string) => `json_extract(${ADDRESS}, '$.${name}')`;
const text = (name: string) => `CASE WHEN json_type(${ADDRESS}, '$.${name}') = 'text'
	THEN ${field(name)} ELSE '' END`;
const ADDRESS_CONDITION = `(${field('$type')} = 'community.lexicon.location.address'
	OR ${field('$type')} IS NULL OR ${field('$type')} = '')
	AND ${text('locality')} != ''
	AND length(${text('locality')}) <= 256
	AND length(${text('country')}) <= 256 AND length(${text('region')}) <= 256`;
// A city's venue points farther apart than this are not reliable evidence of
// one location (e.g. conflicting publisher data or homonymous localities).
const MAX_CITY_POINT_SPREAD_KM = 100;
const PHYSICAL = `COALESCE(json_extract(r.record, '$.mode'), '')
	NOT IN ('community.lexicon.calendar.event#virtual', 'virtual')`;
const scopeKey = (scope: CityScope) => JSON.stringify([scope.city, scope.country, scope.region]);
type Variant = [city: string, country: string, region: string];
type Point = { latitude: number; longitude: number };
type CatalogCity = City & { scope: CityScope; variants: Variant[]; point?: Point };
/** Ordering/membership only. Event bodies and RSVP/profile data are never cached. */
export type CityMember = [uri: string, startsAt: string];
type BuiltCity = CatalogCity & { events: CityMember[] };
type Head = { version: string; updated_at: number };

function validPoint(value: unknown): Point | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const { latitude, longitude } = value as Record<string, unknown>;
	const coordinate = (v: unknown) =>
		typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN;
	const lat = coordinate(latitude);
	const lon = coordinate(longitude);
	return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
		? { latitude: lat, longitude: lon }
		: undefined;
}

// H3 cells coarser than resolution 4 cover too large an area for a useful
// 500 km proximity estimate. Use the center; this is not an exact venue.
function eventPoint(value: unknown): Point | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const location = value as Record<string, unknown>;
	if (location.type === 'community.lexicon.location.geo') return validPoint(location);
	if (
		location.type === 'community.lexicon.location.hthree' &&
		typeof location.value === 'string' &&
		isValidCell(location.value) &&
		getResolution(location.value) >= 4
	) {
		const [latitude, longitude] = cellToLatLng(location.value);
		return validPoint({ latitude, longitude });
	}
	return undefined;
}

function distanceKm(a: Point, b: Point): number {
	const rad = Math.PI / 180;
	const dLat = (b.latitude - a.latitude) * rad;
	const dLon = (b.longitude - a.longitude) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
	return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** The only events-wide city query. Cron runs it once per daily global snapshot. */
async function buildCatalog(db: Database, asOf: string): Promise<BuiltCity[]> {
	const result = await db
		.prepare(
			`SELECT
		${text('locality')} AS city, ${text('country')} AS country, ${text('region')} AS region,
		json_group_array(DISTINCT json_array(r.uri, json_extract(r.record, '$.startsAt'))) AS events,
		json_group_array(DISTINCT CASE WHEN (SELECT count(*) FROM ${LOCATIONS}
			WHERE ${field('$type')} = 'community.lexicon.location.address'
			OR ((${field('$type')} IS NULL OR ${field('$type')} = '') AND ${text('locality')} != '')) = 1
			AND (SELECT count(*) FROM json_each(r.record, '$.locations') g
			WHERE g.type = 'object' AND json_extract(g.value, '$.$type') IN
				('community.lexicon.location.geo', 'community.lexicon.location.hthree')) = 1
			THEN (SELECT json_object(
				'type', json_extract(g.value, '$.$type'),
				'latitude', json_extract(g.value, '$.latitude'),
				'longitude', json_extract(g.value, '$.longitude'),
				'value', json_extract(g.value, '$.value'))
			FROM json_each(r.record, '$.locations') g
			WHERE g.type = 'object' AND json_extract(g.value, '$.$type') IN
				('community.lexicon.location.geo', 'community.lexicon.location.hthree')
			LIMIT 1) END) AS points
		FROM records_event r, ${LOCATIONS}
		WHERE ${discoverableSql('r.record')} AND ${visibleRecordSql('r')} AND ${PHYSICAL}
			AND json_extract(r.record, '$.startsAt') >= ? AND ${ADDRESS_CONDITION}
		GROUP BY ${text('locality')}, ${text('country')}, ${text('region')}
		ORDER BY city, country, region`
		)
		.bind(asOf)
		.all<CityScope & { events: string; points: string }>();
	const rows = result.results.flatMap((raw) => {
		const normalized = normalizeCityAddress(raw);
		return normalized ? [{ raw, ...normalized }] : [];
	});

	// Missing regions join only an unambiguous supplied city/country/region.
	const knownRegions = new Map<string, Map<string, string>>();
	for (const { scope, label } of rows) {
		if (!scope.country || !scope.region) continue;
		const key = JSON.stringify([scope.city, scope.country]);
		const regions = knownRegions.get(key) ?? new Map<string, string>();
		regions.set(scope.region, label.region);
		knownRegions.set(key, regions);
	}
	const groups = new Map<
		string,
		{ entry: CatalogCity; events: Map<string, string>; pointConflict: boolean }
	>();
	for (const { raw, scope, label } of rows) {
		const regions = knownRegions.get(JSON.stringify([scope.city, scope.country]));
		if (!scope.region && regions?.size === 1) {
			const [region, name] = [...regions][0];
			scope.region = region;
			label.region = name;
		}
		const key = scopeKey(scope);
		let group = groups.get(key);
		if (!group) {
			group = {
				entry: { ...label, count: 0, scope, variants: [] },
				events: new Map(),
				pointConflict: false
			};
			groups.set(key, group);
		}
		const readable = (name: string) => name !== name.toUpperCase() && name !== name.toLowerCase();
		if (!readable(group.entry.city) && readable(label.city)) group.entry.city = label.city;
		group.entry.variants.push([raw.city, raw.country, raw.region]);
		for (const value of JSON.parse(raw.points) as unknown[]) {
			if (group.pointConflict) break;
			try {
				const geo = typeof value === 'string' ? JSON.parse(value) : value;
				const point = eventPoint(geo);
				if (!point) continue;
				if (group.entry.point && distanceKm(group.entry.point, point) > MAX_CITY_POINT_SPREAD_KM) {
					delete group.entry.point;
					group.pointConflict = true;
				} else {
					group.entry.point ??= point;
				}
			} catch {
				// Ignore malformed publisher-supplied coordinates.
			}
		}
		for (const [uri, startsAt] of JSON.parse(raw.events) as CityMember[])
			group.events.set(uri, startsAt);
	}
	return [...groups.values()]
		.map(({ entry, events }) => ({
			...entry,
			count: events.size,
			events: [...events].sort(([a, at], [b, bt]) =>
				at < bt ? -1 : at > bt ? 1 : a < b ? -1 : a > b ? 1 : 0
			)
		}))
		.sort((a, b) => b.count - a.count || scopeKey(a.scope).localeCompare(scopeKey(b.scope), 'en'));
}

/** Only cron (and explicit local-dev bootstrapping) creates or refreshes snapshots.
 * A persisted lease prevents duplicate builders across workers/locations. Data
 * is immutable and written in bounded batches; publishing the head is atomic.
 * A failed/interrupted build never replaces the last successfully published one. */
export async function refreshCitySnapshot(db: D1Database, now = Date.now()): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS city_snapshot_state (
			id INTEGER PRIMARY KEY CHECK (id = 1), version TEXT, updated_at INTEGER,
			definition TEXT, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS city_snapshot_data (
			version TEXT NOT NULL, city_key TEXT NOT NULL, part INTEGER NOT NULL,
			created_at INTEGER NOT NULL, data TEXT NOT NULL,
			PRIMARY KEY (version, city_key, part)
		)`),
		db.prepare('INSERT OR IGNORE INTO city_snapshot_state (id) VALUES (1)')
	]);
	const version = crypto.randomUUID();
	const claim = await db
		.prepare(
			`UPDATE city_snapshot_state SET lease_token = ?, lease_until = ?
		WHERE id = 1 AND lease_until <= ?
		AND (updated_at IS NULL OR updated_at <= ? OR definition IS NULL OR definition != ?)`
		)
		.bind(version, now + LEASE_MS, now, now - CITY_SNAPSHOT_INTERVAL_MS, DEFINITION)
		.run();
	if (!(claim.meta.changes > 0)) return;
	try {
		const cities = await buildCatalog(db, new Date(now).toISOString());
		const catalog = cities.map(({ city, country, region, count, scope, variants, point }) => ({
			city,
			country,
			region,
			count,
			scope,
			variants,
			point
		}));
		const statements: D1PreparedStatement[] = [];
		const append = (key: string, value: unknown) => {
			const json = JSON.stringify(value);
			let part = 0;
			for (let offset = 0; offset < json.length;) {
				let end = Math.min(offset + CHUNK_CHARACTERS, json.length);
				// Do not split a UTF-16 surrogate pair across stored text chunks.
				const last = json.charCodeAt(end - 1);
				if (last >= 0xd800 && last <= 0xdbff) end--;
				statements.push(
					db
						.prepare(
							'INSERT INTO city_snapshot_data (version, city_key, part, created_at, data) VALUES (?, ?, ?, ?, ?)'
						)
						.bind(version, key, part++, now, json.slice(offset, end))
				);
				offset = end;
			}
		};
		append('', catalog);
		for (const city of cities) append(scopeKey(city.scope), city.events);
		for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
		await db
			.prepare(
				`UPDATE city_snapshot_state
			SET version = ?, updated_at = ?, definition = ?, lease_token = NULL, lease_until = 0
			WHERE id = 1 AND lease_token = ?`
			)
			.bind(version, now, DEFINITION, version)
			.run();
		await db
			.prepare('DELETE FROM city_snapshot_data WHERE created_at < ?')
			.bind(now - RETENTION_MS)
			.run();
	} finally {
		await db
			.prepare(
				'UPDATE city_snapshot_state SET lease_token = NULL, lease_until = 0 WHERE id = 1 AND lease_token = ?'
			)
			.bind(version)
			.run();
	}
}

async function currentVersion(db: Database): Promise<string | null> {
	const head = await cachedRead('cities:head:v3', 300, async () => {
		try {
			return await db
				.prepare(
					'SELECT version, updated_at FROM city_snapshot_state WHERE id = 1 AND definition = ?'
				)
				.bind(DEFINITION)
				.first<Head>();
		} catch (error) {
			// First deployment before cron bootstraps storage: never scan events.
			if (String(error).includes('no such table')) return null;
			throw error;
		}
	});
	return head?.version ?? null;
}

async function readParts<T>(db: Database, version: string, key: string): Promise<T[] | null> {
	if (!VERSION.test(version)) return null;
	return cachedRead(`cities:data:v3/${version}/${encodeURIComponent(key)}`, 86400, async () => {
		const result = await db
			.prepare(
				'SELECT data FROM city_snapshot_data WHERE version = ? AND city_key = ? ORDER BY part'
			)
			.bind(version, key)
			.all<{ data: string }>();
		return result.results.length
			? (JSON.parse(result.results.map(({ data }) => data).join('')) as T[])
			: null;
	});
}

async function catalog(db: Database, version?: string): Promise<CatalogCity[] | null> {
	const id = version ?? (await currentVersion(db));
	return id ? readParts<CatalogCity>(db, id, '') : null;
}

function resolveCity(cities: CatalogCity[], input: CityScope): CatalogCity | null {
	const normalized = normalizeCityAddress(input);
	if (!normalized) return null;
	let matches = cities.filter((city) => scopeKey(city.scope) === scopeKey(normalized.scope));
	if (!matches.length)
		matches = cities.filter((city) =>
			city.variants.some(([name, country, region]) => {
				const address = normalizeCityAddress({ city: name, country, region });
				return address && scopeKey(address.scope) === scopeKey(normalized.scope);
			})
		);
	return matches.length === 1 ? matches[0] : null;
}

export async function readCitySnapshot(
	db: Database,
	input: CityScope,
	version?: string
): Promise<{
	version: string;
	events: CityMember[];
} | null> {
	const id = version ?? (await currentVersion(db));
	if (!id) return null;
	const cities = await catalog(db, id);
	const city = cities && resolveCity(cities, input);
	if (!city) return null;
	const events = await readParts<CityMember>(db, id, scopeKey(city.scope));
	return events ? { version: id, events } : null;
}

/** Live location/visibility check over ONLY the page's primary-key-selected
 * records. Also retained for compatibility with the original public pipeline. */
export async function cityConditions(
	db: Database,
	input: CityScope,
	version?: string
): Promise<{ conditions: string[]; params: string[] }> {
	const empty = { conditions: ['0 = 1'], params: [] };
	if (!normalizeCityAddress(input)) return empty;
	const cities = await catalog(db, version);
	const city = cities && resolveCity(cities, input);
	if (!city) return empty;
	return {
		conditions: [
			discoverableSql('r.record'),
			PHYSICAL,
			`EXISTS (SELECT 1 FROM ${LOCATIONS}, json_each(?) v
				WHERE ${ADDRESS_CONDITION}
				AND ${text('locality')} = json_extract(v.value, '$[0]')
				AND ${text('country')} = json_extract(v.value, '$[1]')
				AND ${text('region')} = json_extract(v.value, '$[2]'))`
		],
		params: [JSON.stringify(city.variants)]
	};
}

/** Select from the complete cached catalog, not just the worldwide top 20.
 * Coordinates come only from events with one address and one geo or precise H3 point; cities
 * with widely conflicting event coordinates fall back to country matching. */
export async function readCitySuggestions(
	db: Database,
	location?: { latitude?: unknown; longitude?: unknown; country?: unknown },
	asOf?: string
): Promise<{ cities: City[]; nearby: City[]; inCountry: City[] }> {
	const cities = asOf ? await buildCatalog(db, asOf) : await catalog(db);
	if (!cities) throw new Error('City snapshot is not available yet');
	const visitor = validPoint(location);
	const country = typeof location?.country === 'string' ? countryCode(location.country) : undefined;
	const nearby: City[] = [];
	const inCountry: City[] = [];
	for (const { city, country: cityCountry, region, count, point } of cities) {
		const result = { city, country: cityCountry, region, count };
		if (visitor && point && distanceKm(visitor, point) <= 500) nearby.push(result);
		else if ((!visitor || !point) && country && countryCode(cityCountry) === country)
			inCountry.push(result);
	}
	return {
		cities: cities.slice(0, TOP_CITIES_LIMIT).map(({ city, country, region, count }) => ({
			city,
			country,
			region,
			count
		})),
		nearby: nearby.slice(0, TOP_CITIES_LIMIT),
		inCountry: inCountry.slice(0, TOP_CITIES_LIMIT)
	};
}

/** Resolve the IP city and, if necessary, the closest event city from one snapshot. */
export async function readNearbyPage(
	db: Database,
	location?: {
		city?: unknown;
		country?: unknown;
		region?: unknown;
		regionCode?: unknown;
		latitude?: unknown;
		longitude?: unknown;
	},
	search = ''
): Promise<{
	detected: CityScope | null;
	matched: City | null;
	nearest: City | null;
	cities: CityScope[];
}> {
	const entries = await catalog(db);
	if (!entries) throw new Error('City snapshot is not available yet');
	const { cityPoint, searchCityGazetteer } = await import('./city-gazetteer');
	const display = ({ city, country, region, count }: CatalogCity): City => ({
		city,
		country,
		region,
		count
	});
	const query = normalizeCityField(search.slice(0, 256));
	const eventCities = entries
		.filter((entry) => !query || normalizeCityField(entry.city).includes(query))
		.slice(0, 30)
		.map(display);
	const cities: CityScope[] = [];
	const seen = new Set<string>();
	for (const city of [...eventCities, ...(query ? searchCityGazetteer(query) : [])]) {
		const normalized = normalizeCityAddress(city);
		if (!normalized) continue;
		const id = scopeKey(normalized.scope);
		if (seen.has(id)) continue;
		seen.add(id);
		cities.push(city);
		if (cities.length === 30) break;
	}
	const detected = normalizeCityAddress({
		city: typeof location?.city === 'string' ? location.city : '',
		country: typeof location?.country === 'string' ? location.country : '',
		region:
			typeof location?.region === 'string'
				? location.region
				: typeof location?.regionCode === 'string'
					? location.regionCode
					: ''
	});
	if (!detected || !countryCode(detected.label.country))
		return { detected: null, matched: null, nearest: null, cities };
	const candidates = entries.filter(
		(entry) =>
			entry.scope.city === detected.scope.city && entry.scope.country === detected.scope.country
	);
	const exact = candidates.filter((entry) => entry.scope.region === detected.scope.region);
	const withoutRegion = candidates.filter((entry) => !entry.scope.region);
	const matched =
		exact.length === 1
			? exact[0]
			: exact.length === 0 &&
				  candidates.length === 1 &&
				  withoutRegion.length === 1 &&
				  cityPoint(detected.label)
				? withoutRegion[0]
				: null;
	const visitor = validPoint(location) ?? cityPoint(detected.label);
	let closest: CatalogCity | null = null;
	let distance = Infinity;
	if (visitor) {
		for (const entry of entries) {
			if (entry === matched) continue;
			const point = entry.point ?? cityPoint(entry);
			if (!point) continue;
			const km = distanceKm(visitor, point);
			if (km < distance) {
				distance = km;
				closest = entry;
			}
		}
	}
	return {
		detected: detected.label,
		matched: matched ? display(matched) : null,
		nearest: closest ? display(closest) : null,
		cities
	};
}

/** Optional asOf bypasses snapshot storage for deterministic tests/diagnostics. */
export async function readTopCities(db: Database, asOf?: string): Promise<City[]> {
	const cities = asOf ? await buildCatalog(db, asOf) : await catalog(db);
	if (!cities) throw new Error('City snapshot is not available yet');
	return cities
		.slice(0, TOP_CITIES_LIMIT)
		.map(({ city, country, region, count }) => ({ city, country, region, count }));
}
