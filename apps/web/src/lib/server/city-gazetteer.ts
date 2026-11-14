import citiesTsv from './geonames/cities.tsv?raw';
import regionsTsv from './geonames/regions.tsv?raw';
import { normalizeCityField, type CityScope } from '#lib/cities.js';
import {
	cityNameKey,
	citySearchNames,
	countryCode,
	normalizeCityAddress
} from './city-normalization';

// Compact tab-separated data; see scripts/build-city-gazetteer.mjs.
type Entry = [
	name: string,
	ascii: string,
	country: string,
	regionCode: string,
	regionName: string,
	regionAscii: string,
	latitude: number,
	longitude: number
];
export type CityPoint = { latitude: number; longitude: number };
const index = new Map<string, Entry[]>();
const searchIndex: { entry: Entry; names: string[]; text: string }[] = [];
let initialized = false;
const key = (country: string, name: string) => `${country}:${cityNameKey(name, country)}`;
function initialize() {
	if (initialized) return;
	const rows = (tsv: string) =>
		tsv
			.split('\n')
			.filter(Boolean)
			.map((line) => line.split('\t'));
	const regions = new Map(rows(regionsTsv).map(([key, ...names]) => [key, names]));
	for (const [name, country, code, lat, lon, ascii = name] of rows(citiesTsv)) {
		const [regionName = '', regionAscii = regionName] = regions.get(`${country}.${code}`) ?? [];
		const latitude = Number(lat);
		const longitude = Number(lon);
		const entry: Entry = [name, ascii, country, code, regionName, regionAscii, latitude, longitude];
		const names = [
			...new Set([...citySearchNames(name, country), ...citySearchNames(ascii, country)])
		];
		searchIndex.push({ entry, names, text: names.join('\n') });
		for (const k of new Set([key(entry[2], entry[0]), key(entry[2], entry[1])])) {
			const matches = index.get(k) ?? [];
			matches.push(entry);
			index.set(k, matches);
		}
	}
	initialized = true;
}

export function searchCityGazetteer(query: string, limit = 30): CityScope[] {
	const term = normalizeCityField(query);
	if (!term) return [];
	initialize();
	// One pass over the index: exact names rank before prefixes before substrings.
	// `text` joins an entry's names so most entries are rejected with one check.
	const buckets: Entry[][] = [[], [], []];
	for (const { entry, names, text } of searchIndex) {
		if (!text.includes(term)) continue;
		const rank = names.some((value) => value === term)
			? 0
			: names.some((value) => value.startsWith(term))
				? 1
				: 2;
		buckets[rank].push(entry);
	}
	const matches: CityScope[] = [];
	const seen = new Set<string>();
	for (const [name, , country, , region] of buckets.flat()) {
		const city = { city: name, country, region };
		const id = JSON.stringify([normalizeCityField(name), country, normalizeCityField(region)]);
		if (seen.has(id) || !cityPoint(city)) continue;
		seen.add(id);
		matches.push(city);
		if (matches.length >= limit) break;
	}
	return matches;
}

/** Never guess between same-named cities or across countries/regions. */
export function cityPoint(city: CityScope): CityPoint | undefined {
	const country = countryCode(city.country);
	if (!country || !city.city.trim()) return undefined;
	initialize();
	let matches = index.get(key(country, city.city)) ?? [];
	if (city.region.trim()) {
		const input = normalizeCityAddress(city)?.scope.region ?? normalizeCityField(city.region);
		matches = matches.filter(([, , , code, name, ascii]) => {
			const candidates = [
				code,
				name,
				ascii,
				name.replace(/^state of /i, ''),
				ascii.replace(/^state of /i, '')
			].filter(Boolean);
			return candidates.some(
				(region) =>
					(normalizeCityAddress({ city: city.city, country, region })?.scope.region ??
						normalizeCityField(region)) === input
			);
		});
	}
	if (matches.length !== 1) return undefined;
	return { latitude: matches[0][6], longitude: matches[0][7] };
}
