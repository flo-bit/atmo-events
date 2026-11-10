import data from './geonames/cities.json';
import { normalizeCityField, type CityScope } from '#lib/cities.js';
import { countryCode, normalizeCityAddress } from './city-normalization';

type Entry = [string, string, string, string, string, string, number, number];
export type CityPoint = { latitude: number; longitude: number };
const index = new Map<string, Entry[]>();
let initialized = false;
const key = (country: string, name: string) => `${country}:${normalizeCityField(name)}`;
function initialize() {
	if (initialized) return;
	for (const entry of data as Entry[]) {
		for (const name of new Set([entry[0], entry[1]])) {
			const k = key(entry[2], name);
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
	const matches: CityScope[] = [];
	const seen = new Set<string>();
	for (const startsWith of [true, false]) {
		for (const [name, ascii, country, , region] of data as Entry[]) {
			const names = [normalizeCityField(name), normalizeCityField(ascii)];
			if (!names.some((value) => (startsWith ? value.startsWith(term) : value.includes(term))))
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
