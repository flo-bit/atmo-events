import codes from 'i18n-iso-countries/codes.json' with { type: 'json' };
import english from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import { cityScope, normalizeCityField, type CityScope } from '#lib/cities.js';

const countryKey = (value: string) =>
	normalizeCityField(value).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[‘’]/g, "'");
let countries: Map<string, string> | undefined;
function countryAliases() {
	if (countries) return countries;
	countries = new Map();
	// Static ISO data plus the runtime's CLDR names. No network or gazetteer.
	const displays = ['en', 'de', 'nl', 'fr', 'es', 'pt', 'sv', 'nb', 'zh-Hant'].map(
		(locale) => new Intl.DisplayNames([locale], { type: 'region' })
	);
	for (const [alpha2, alpha3] of codes) {
		countries.set(countryKey(alpha2), alpha2);
		countries.set(countryKey(alpha3), alpha2);
		for (const display of displays) countries.set(countryKey(display.of(alpha2)!), alpha2);
	}
	for (const [code, names] of Object.entries(english.countries)) {
		for (const name of Array.isArray(names) ? names : [names])
			countries.set(countryKey(name), code);
	}
	countries.set('uk', 'GB');
	countries.set('臺灣', 'TW');
	return countries;
}

export function countryCode(value: string): string | undefined {
	const aliases = countryAliases();
	const direct = aliases.get(countryKey(value));
	if (direct) return direct;
	// Some publishers supply e.g. "België / Belgique / Belgien".
	const parts = value.split(/\s*[/|]\s*/);
	const codes = parts.map((part) => aliases.get(countryKey(part)));
	return parts.length > 1 && codes[0] && codes.every((code) => code === codes[0])
		? codes[0]
		: undefined;
}

// Small, explicit administrative-name equivalences, NOT a list of cities.
// Unknown regions are preserved rather than guessed. Codes are country-scoped.
const REGIONS: Record<string, Record<string, string>> = {
	US: {
		AL: 'Alabama',
		AK: 'Alaska',
		AZ: 'Arizona',
		AR: 'Arkansas',
		CA: 'California',
		CO: 'Colorado',
		CT: 'Connecticut',
		DE: 'Delaware',
		DC: 'District of Columbia',
		FL: 'Florida',
		GA: 'Georgia',
		HI: 'Hawaii',
		ID: 'Idaho',
		IL: 'Illinois',
		IN: 'Indiana',
		IA: 'Iowa',
		KS: 'Kansas',
		KY: 'Kentucky',
		LA: 'Louisiana',
		ME: 'Maine',
		MD: 'Maryland',
		MA: 'Massachusetts',
		MI: 'Michigan',
		MN: 'Minnesota',
		MS: 'Mississippi',
		MO: 'Missouri',
		MT: 'Montana',
		NE: 'Nebraska',
		NV: 'Nevada',
		NH: 'New Hampshire',
		NJ: 'New Jersey',
		NM: 'New Mexico',
		NY: 'New York',
		NC: 'North Carolina',
		ND: 'North Dakota',
		OH: 'Ohio',
		OK: 'Oklahoma',
		OR: 'Oregon',
		PA: 'Pennsylvania',
		RI: 'Rhode Island',
		SC: 'South Carolina',
		SD: 'South Dakota',
		TN: 'Tennessee',
		TX: 'Texas',
		UT: 'Utah',
		VT: 'Vermont',
		VA: 'Virginia',
		WA: 'Washington',
		WV: 'West Virginia',
		WI: 'Wisconsin',
		WY: 'Wyoming',
		PR: 'Puerto Rico',
		GU: 'Guam',
		VI: 'United States Virgin Islands',
		AS: 'American Samoa',
		MP: 'Northern Mariana Islands'
	},
	CA: {
		AB: 'Alberta',
		BC: 'British Columbia',
		MB: 'Manitoba',
		NB: 'New Brunswick',
		NL: 'Newfoundland and Labrador',
		NS: 'Nova Scotia',
		NT: 'Northwest Territories',
		NU: 'Nunavut',
		ON: 'Ontario',
		PE: 'Prince Edward Island',
		QC: 'Québec',
		SK: 'Saskatchewan',
		YT: 'Yukon'
	},
	NL: {
		DR: 'Drenthe',
		FL: 'Flevoland',
		FR: 'Friesland',
		GE: 'Gelderland',
		GR: 'Groningen',
		LI: 'Limburg',
		NB: 'Noord-Brabant',
		NH: 'Noord-Holland',
		OV: 'Overijssel',
		UT: 'Utrecht',
		ZE: 'Zeeland',
		ZH: 'Zuid-Holland'
	},
	GB: { ENG: 'England', SCT: 'Scotland', WLS: 'Wales', NIR: 'Northern Ireland' }
};
const extraRegions: Record<string, Record<string, string>> = {
	US: { 'D.C.': 'DC', 'Washington DC': 'DC', 'Washington, D.C.': 'DC' },
	CA: { Quebec: 'QC', 'Newfoundland & Labrador': 'NL' },
	NL: { 'North Holland': 'NH', 'South Holland': 'ZH', 'North Brabant': 'NB', Fryslân: 'FR' }
};
const regions = new Map<string, { key: string; name: string }>();
for (const [country, entries] of Object.entries(REGIONS)) {
	for (const [code, name] of Object.entries(entries)) {
		for (const alias of [code, name, `${country}-${code}`])
			regions.set(`${country}:${countryKey(alias)}`, { key: code.toLowerCase(), name });
	}
}
for (const [country, entries] of Object.entries(extraRegions)) {
	for (const [alias, code] of Object.entries(entries))
		regions.set(`${country}:${countryKey(alias)}`, {
			key: code.toLowerCase(),
			name: REGIONS[country][code]
		});
}
function region(value: string, country: string) {
	return regions.get(`${country}:${countryKey(value)}`);
}

export type NormalizedAddress = { scope: CityScope; label: CityScope };

/** Cleans only supplied text. A comma is not automatically a city separator:
 * suffixes must be a recognized country/region/postal format. Contradictions
 * and unparseable comma-addresses are omitted, not guessed. */
export function normalizeCityAddress(input: CityScope): NormalizedAddress | null {
	if (!cityScope(input)) return null;
	let country = countryCode(input.country) ?? input.country.trim();
	let regionName = input.region.trim().normalize('NFKC').replace(/\s+/g, ' ');
	let knownRegion = region(regionName, country);
	const parts = input.city
		.normalize('NFKC')
		.split(',')
		.map((part) => part.trim().replace(/\s+/g, ' '));
	if (parts.length > 1) {
		const last = parts.at(-1)!;
		// CO/CA/IN in a US address are states, not Colombia/Canada/India.
		const suffixCountry = region(last, country) ? undefined : countryCode(last);
		if (suffixCountry) {
			// With no country field, a short suffix could be a foreign state or
			// a country code. Do not guess which interpretation was intended.
			if (!country && /^[A-Za-z]{2,3}$/.test(last)) return null;
			if (country && country !== suffixCountry) return null;
			country = suffixCountry;
			parts.pop();
			knownRegion = region(regionName, country);
		}
		const postal =
			country === 'US'
				? /^\d{5}(?:-\d{4})?$/
				: country === 'CA'
					? /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i
					: null;
		if (parts.length > 1 && postal?.test(parts.at(-1)!)) parts.pop();
		if (parts.length > 1) {
			const suffix = parts.at(-1)!;
			const suffixRegion = region(suffix, country);
			if (suffixRegion) {
				if (regionName && (knownRegion?.key ?? normalizeCityField(regionName)) !== suffixRegion.key)
					return null;
				knownRegion = suffixRegion;
				regionName = suffixRegion.name;
				parts.pop();
			} else if (regionName && normalizeCityField(suffix) === normalizeCityField(regionName))
				parts.pop();
		}
	}
	if (parts.length !== 1 || !parts[0]) return null;
	const name = parts[0];
	if (
		/^(?:test|tbd|tba|n\/?a|unknown|online|virtual|none|null)$/i.test(name) ||
		/https?:\/\/|@|\d{4}/i.test(name)
	)
		return null;
	const label = { city: name, country, region: knownRegion?.name ?? regionName };
	const scope = cityScope({ ...label, region: knownRegion?.key ?? regionName });
	return scope ? { scope, label } : null;
}
