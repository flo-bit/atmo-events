import type { Database } from '@atmo-dev/contrail';
import { TOP_CITIES_LIMIT, type City, type CityScope } from '#lib/cities.js';
import { discoverableSql } from '#lib/search/server/discoverability.js';
import { normalizeCityAddress } from './city-normalization';
import { cachedRead } from './edge-cache';

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
const PHYSICAL = `COALESCE(json_extract(r.record, '$.mode'), '')
	NOT IN ('community.lexicon.calendar.event#virtual', 'virtual')`;
const scopeKey = (scope: CityScope) => JSON.stringify([scope.city, scope.country, scope.region]);
type Variant = [city: string, country: string, region: string];
type CatalogCity = City & { scope: CityScope; variants: Variant[] };

/** Small request-time projection, not a persisted enrichment table. Aggregate
 * original address variants in D1; normalize supplied text in JS and union URIs
 * so duplicate addresses/aliases still count an event only once per city. Only
 * this compact catalog (labels/counts/variants, NOT URIs) is cached at the edge. */
async function readCatalog(db: Database, asOf: string): Promise<CatalogCity[]> {
	const result = await db
		.prepare(
			`SELECT
		${text('locality')} AS city, ${text('country')} AS country, ${text('region')} AS region,
		json_group_array(DISTINCT r.uri) AS uris
		FROM records_event r, ${LOCATIONS}
		WHERE ${discoverableSql('r.record')} AND ${PHYSICAL}
			AND json_extract(r.record, '$.startsAt') >= ? AND ${ADDRESS_CONDITION}
		GROUP BY ${text('locality')}, ${text('country')}, ${text('region')}
		ORDER BY city, country, region`
		)
		.bind(asOf)
		.all<CityScope & { uris: string }>();
	const rows = result.results.flatMap((raw) => {
		const normalized = normalizeCityAddress(raw);
		return normalized ? [{ raw, ...normalized }] : [];
	});

	// A missing region can join a known region ONLY when the supplied city and
	// country have exactly one known region in this snapshot. Never conflate e.g.
	// Springfield, Illinois and Springfield, Massachusetts, or guess a country.
	const knownRegions = new Map<string, Map<string, string>>();
	for (const { scope, label } of rows) {
		if (!scope.country || !scope.region) continue;
		const key = JSON.stringify([scope.city, scope.country]);
		const regions = knownRegions.get(key) ?? new Map<string, string>();
		regions.set(scope.region, label.region);
		knownRegions.set(key, regions);
	}
	const groups = new Map<string, { entry: CatalogCity; uris: Set<string> }>();
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
			group = { entry: { ...label, count: 0, scope, variants: [] }, uris: new Set() };
			groups.set(key, group);
		}
		// Prefer mixed/title case over an all-caps/all-lowercase publisher label.
		const readable = (name: string) => name !== name.toUpperCase() && name !== name.toLowerCase();
		if (!readable(group.entry.city) && readable(label.city)) group.entry.city = label.city;
		group.entry.variants.push([raw.city, raw.country, raw.region]);
		for (const uri of JSON.parse(raw.uris) as string[]) group.uris.add(uri);
	}
	return [...groups.values()]
		.map(({ entry, uris }) => ({ ...entry, count: uris.size }))
		.sort((a, b) => b.count - a.count || scopeKey(a.scope).localeCompare(scopeKey(b.scope), 'en'));
}

function catalog(db: Database): Promise<CatalogCity[]> {
	return cachedRead('cities:catalog:v2', 300, () => readCatalog(db, new Date().toISOString()));
}

/** Same catalog and variants for ranking, page 1 and load-more. A missing or
 * ambiguous scope fails closed, never becoming an unfiltered event query. */
export async function cityConditions(
	db: Database,
	input: CityScope
): Promise<{ conditions: string[]; params: string[] }> {
	const normalized = normalizeCityAddress(input);
	const empty = { conditions: ['0 = 1'], params: [] };
	if (!normalized) return empty;
	const cities = await catalog(db);
	let matches = cities.filter((city) => scopeKey(city.scope) === scopeKey(normalized.scope));
	// Accept old links and missing-region source variants that were merged into
	// an unambiguous city. The top-20 links already carry the canonical labels.
	if (!matches.length)
		matches = cities.filter((city) =>
			city.variants.some(([name, country, region]) => {
				const address = normalizeCityAddress({ city: name, country, region });
				return address && scopeKey(address.scope) === scopeKey(normalized.scope);
			})
		);
	if (matches.length !== 1) return empty;
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
		params: [JSON.stringify(matches[0].variants)]
	};
}

/** Optional asOf bypasses the cache for deterministic tests/local diagnostics. */
export async function readTopCities(db: Database, asOf?: string): Promise<City[]> {
	const cities = asOf ? await readCatalog(db, asOf) : await catalog(db);
	return cities
		.slice(0, TOP_CITIES_LIMIT)
		.map(({ city, country, region, count }) => ({ city, country, region, count }));
}
