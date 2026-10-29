/** Publisher-supplied address fields, not inferred geographic identities. */
export type CityScope = { city: string; country: string; region: string };
export type City = CityScope & { count: number };
export const TOP_CITIES_LIMIT = 20;

// SQL matches the original address variants, so normalization can use full
// Unicode here without depending on SQLite's ASCII-only lower().
export function normalizeCityField(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cityScope(value: CityScope): CityScope | null {
	if (!value || typeof value !== 'object') return null;
	for (const field of ['city', 'country', 'region'] as const) {
		if (typeof value[field] !== 'string' || value[field].length > 256) return null;
	}
	const scope = {
		city: normalizeCityField(value.city),
		country: normalizeCityField(value.country),
		region: normalizeCityField(value.region)
	};
	return scope.city ? scope : null;
}

/** Both qualifiers are always carried, including empty values. */
export function citySearchParams(city: CityScope): string {
	return new URLSearchParams({ country: city.country, region: city.region }).toString();
}

const countries = new Intl.DisplayNames(['en'], { type: 'region' });
export function cityContext(city: Pick<CityScope, 'country' | 'region'>): string {
	const code = city.country.toUpperCase();
	const country = /^[A-Z]{2}$/.test(code) ? (countries.of(code) ?? city.country) : city.country;
	return [city.region, country].filter(Boolean).join(', ');
}
