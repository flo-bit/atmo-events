import data from './geonames/cities.json';
import { normalizeCityField, type CityScope } from '#lib/cities.js';
import {
	cityNameKey,
	citySearchNames,
	countryCode,
	normalizeCityAddress
} from './city-normalization';

type Entry = [string, string, string, string, string, string, number, number];
export type CityPoint = { latitude: number; longitude: number };
const index = new Map<string, Entry[]>();
const searchIndex: { entry: Entry; names: string[] }[] = [];
let initialized = false;
const key = (country: string, name: string) => `${country}:${cityNameKey(name, country)}`;
function initialize() {
	if (initialized) return;
	for (const entry of data as Entry[]) {
		searchIndex.push({
			entry,
			names: [
				...new Set([...citySearchNames(entry[0], entry[2]), ...citySearchNames(entry[1], entry[2])])
			]
		});
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
	const matches: CityScope[] = [];
	const seen = new Set<string>();
	for (const match of ['exact', 'prefix', 'substring'] as const) {
		for (const {
			entry: [name, , country, , region],
			names
		} of searchIndex) {
			if (
				!names.some((value) =>
					match === 'exact'
						? value === term
						: match === 'prefix'
							? value.startsWith(term)
							: value.includes(term)
				)
			)
				continue;
			const city = { city: name, country, region };
			const id = JSON.stringify([normalizeCityField(name), country, normalizeCityField(region)]);
			if (seen.has(id) || !cityPoint(city)) continue;
			seen.add(id);
			matches.push(city);
			if (matches.length >= limit) return matches;
		}
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
