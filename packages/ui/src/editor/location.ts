import codes from 'i18n-iso-countries/codes.json' with { type: 'json' };
import english from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import type { EventData } from '../event-types.js';

// Use only the maintained JSON datasets, not the package's CommonJS runtime:
// Vite's dev SSR module runner cannot evaluate its require() calls as ESM.
const countryCodes = new Map<string, string>();
for (const [alpha2, alpha3] of codes) {
	countryCodes.set(alpha2, alpha2);
	countryCodes.set(alpha3, alpha2);
}

function countryNameKey(name: string): string {
	return name.trim().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[‘’]/g, "'").toLowerCase();
}

const countryNames = new Map<string, string>();
for (const [code, names] of Object.entries(english.countries)) {
	for (const name of Array.isArray(names) ? names : [names]) {
		countryNames.set(countryNameKey(name), code);
	}
}

export function normalizeCountryCode(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const name = value.trim().normalize('NFKC').replace(/[‘’]/g, "'");
	const code = name.toUpperCase();
	const alpha2 = countryCodes.get(code);
	if (alpha2) return alpha2;
	// UK is a common alias, but GB is the assigned ISO 3166-1 code.
	if (code === 'UK') return 'GB';
	return countryNames.get(countryNameKey(name));
}

export class LocationValidationError extends Error {
	constructor() {
		super(
			'Choose a location with a valid country before publishing. Remove and re-add the location to update it.'
		);
		this.name = 'LocationValidationError';
	}
}

export function normalizeAddressLocation<T extends { country?: unknown }>(
	location: T
): T & { country: string } {
	const country = normalizeCountryCode(location.country);
	// country is required by community.lexicon.location.address. Never omit it,
	// truncate a name, or guess a country when the input cannot be resolved.
	if (!country) throw new LocationValidationError();
	return { ...location, country };
}

export function normalizeEventLocations(locations: NonNullable<EventData['locations']>) {
	return locations.map((location) =>
		location.$type === 'community.lexicon.location.address'
			? normalizeAddressLocation({ ...location, country: location.country })
			: location
	);
}
