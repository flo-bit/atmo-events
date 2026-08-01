// One place that knows how to read a human-readable location out of a record's
// `locations[]`, so every reader (the event page, cards, embeds, calendar export)
// agrees on it. The key case it centralizes: a record can hold its place name on
// the ADDRESS entry or, when it has no address fields at all, on the GEO entry's
// optional `name` — a reader that only looks at the address entry shows no
// location for the second kind, which is most of what other clients write.

import { coordsUsableForDisplay } from './editor/location.js';

const ADDRESS_TYPE = 'community.lexicon.location.address';
const GEO_TYPE = 'community.lexicon.location.geo';

// Postal-code shapes, used to recognise a code riding along inside a segment that
// also names a place: "Bristol BS9 2UN", "London N16 9HP", "CO 80123". Three
// families cover what the corpus actually holds; anything unrecognised is simply
// treated as part of the name, which is the safe direction.
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const CA_POSTCODE = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;
const US_POSTCODE = /^\d{5}(?:-\d{4})?$/;
const isPostcode = (token: string) =>
	UK_POSTCODE.test(token) || CA_POSTCODE.test(token) || US_POSTCODE.test(token);

/** The same segment with a trailing postal code removed, or null when there is none.
 *  A UK or Canadian code is two whitespace tokens ("N16 9HP"), a US ZIP is one, so
 *  both tail lengths are tried. */
function withoutPostcode(segment: string): string | null {
	const tokens = segment.split(/\s+/);
	if (tokens.length >= 3 && isPostcode(tokens.slice(-2).join(' ')))
		return tokens.slice(0, -2).join(' ');
	if (tokens.length >= 2 && isPostcode(tokens[tokens.length - 1]))
		return tokens.slice(0, -1).join(' ');
	return null;
}

/** Tidy a name written by another client before anything reads it. Geocoders emit a
 *  feature's own name again as the next segment when the feature and its street or
 *  area share a name ("Three Pools, Three Pools, Llanvetherine"), and they emit
 *  empty segments and stray double spaces ("58th Bristol Scout Group,, Gadshill
 *  Road"). Both render verbatim in the full label. Only ADJACENT repeats collapse —
 *  a segment legitimately recurring further along is left alone. */
function cleanName(name: string | undefined): string | undefined {
	if (!name) return undefined;
	const segments = name
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const kept: string[] = [];
	for (const segment of segments) {
		if (kept.length && kept[kept.length - 1].toLowerCase() === segment.toLowerCase()) continue;
		kept.push(segment);
	}
	return kept.join(', ') || undefined;
}

type LocationEntry = { $type?: string; [k: string]: unknown };

// Trim what comes out, not just what gets tested: records hold hand-entered values
// with trailing spaces ("Copenhagen "), and passing those through put a space before
// the comma in every joined label and map query built from them.
function str(source: LocationEntry | undefined, key: string): string | undefined {
	const v = source?.[key];
	if (typeof v !== 'string') return undefined;
	const trimmed = v.trim();
	return trimmed ? trimmed : undefined;
}

export interface LocationSummary {
	/** Address entry's name, else the geo entry's name. */
	name?: string;
	street?: string;
	locality?: string;
	region?: string;
	country?: string;
	/** Geo entry coordinates, as the raw lexicon strings. */
	lat?: string;
	lng?: string;
}

/** A bare point in the same form the editor and the event page show, so a record
 *  with coordinates and nothing else still reads as a location. Empty when the
 *  coordinates are unusable: blank or non-numeric, outside WGS84, or the 0,0
 *  sentinel — a record written by another client can hold a point the editor and
 *  the search normalizer would both reject, and rendering it would state a
 *  position that does not exist. Number('') is 0, so the blank check cannot be
 *  skipped.
 *
 *  Held to `coordsUsableForDisplay`, the same bound the map links use, and for the
 *  same reason: this string is the LAST-RESORT label, reached only when the record
 *  has no address text and no name. So it is the one case where a rejected point
 *  leaves nothing to show — which is correct, because 0,0 is what a record carries
 *  when nobody could geocode the place, i.e. exactly a record with no position. A
 *  looser bound here would also re-arm the map link: readers fall back to querying
 *  the label when they have no point to query, so a rendered "0.00000, 0.00000"
 *  becomes a Google Maps search for the Gulf of Guinea. */
export function formatPoint(lat: string | undefined, lng: string | undefined): string {
	if (!lat?.trim() || !lng?.trim()) return '';
	const latitude = Number(lat);
	const longitude = Number(lng);
	if (!coordsUsableForDisplay(latitude, longitude)) return '';
	return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** The address parts worth appending after `name`, in order, dropping any that the
 *  NAME already states — because a name written by another client is often a whole
 *  reverse-geocoded string ("Cafe, Paris" alongside locality Paris).
 *
 *  Only against the name. The fields are never de-duplicated against EACH OTHER: a
 *  city that shares its state's name is a conventional label, not a repetition, and
 *  dropping half of it makes the place more ambiguous rather than less. "New York,
 *  New York" is how that city is written, and "New York" alone could be either the
 *  city or the state; likewise Wien, Québec, Zürich and Luzern, each a city inside a
 *  state, province or canton of the same name. There is no case in the corpus where
 *  locality and region repeat and the repetition is NOT this pattern.
 *
 *  Matching is on whole comma segments, so a name that merely contains the word
 *  ("Paris Street Cafe") does not swallow the locality — with one exception: a
 *  segment that is a place followed by its postal code ("Bristol BS9 2UN",
 *  "CO 80123") states that place, and whole-segment matching alone cannot see it.
 *  Such a segment counts twice, as itself and as its postcode-stripped form, so the
 *  field is recognised as a repeat. The postcode is only stripped for COMPARISON —
 *  the name still renders whole, because a calendar export wants the code.
 *
 *  Positional: the result has one slot per input, `undefined` where a part was
 *  dropped, so a caller that lays its fields out separately (the event page shows
 *  street+locality on one line and the whole address on another) can keep them
 *  apart and still get the same de-duplication a single joined label gets. */
export function dropRepeats(
	name: string | undefined,
	parts: ReadonlyArray<string | undefined>
): Array<string | undefined> {
	const stated = new Set<string>();
	for (const raw of (name ?? '').split(',')) {
		const segment = raw.trim();
		if (!segment) continue;
		stated.add(segment.toLowerCase());
		const bare = withoutPostcode(segment);
		if (bare) stated.add(bare.toLowerCase());
	}

	return parts.map((part) => {
		const value = part?.trim();
		if (!value) return undefined;
		return stated.has(value.toLowerCase()) ? undefined : value;
	});
}

function withoutRepeats(name: string | undefined, parts: Array<string | undefined>): string[] {
	return dropRepeats(name, parts).filter((v): v is string => Boolean(v));
}

/** The location string for a space-constrained reader (cards, embeds): the place,
 *  then the town. The place leads because it is the point of the pick — showing
 *  "Chicago, Illinois" for an event in Humboldt Park is the very bug this module
 *  exists to fix — and the town follows because a venue name alone does not answer
 *  "is this near me?", which is what a reader scanning a LIST is asking.
 *
 *  The place is the name, or the street when there is no name. See
 *  `locationShortParts` for why the street has to stand in.
 *
 *  Nothing here shortens the name. It is tempting to, because records authored
 *  elsewhere put whole reverse-geocoded strings in that field, and a card would
 *  rather show "Om Being, London" than "Om Being, Amhurst Terrace, London, UK". But
 *  picking the town back out of one of those strings means guessing which comma
 *  segment is a street and which is a settlement, across every locale and every
 *  client's free text, and a rule for that is wrong often enough — and quietly
 *  enough — that it is not worth having. Measured over the index, shortening helps
 *  exactly 7 records that carry real address fields; everything else it does is a
 *  guess at somebody else's string.
 *
 *  So the fix belongs where the data is still structured, and it is in
 *  `buildLocationEntries`: a pick with no ISO country code now keeps its town on the
 *  address entry instead of discarding it, incomplete though that entry is. Records
 *  saved from here on need no guessing. The ones already in the index render
 *  whatever string they were given — long, sometimes, but never invented, and it is
 *  the LAYOUT's job to survive that, which is what `locationShortParts` is for. */
export function locationShortLabel(
	locations: ReadonlyArray<LocationEntry> | undefined | null
): string | undefined {
	const parts = locationShortParts(locations);
	if (!parts) return undefined;

	const joined = [parts.place, ...parts.context].filter(Boolean).join(', ');
	return joined || undefined;
}

/** The same thing `locationShortLabel` joins, kept apart so a caller can lay the
 *  two out separately. Cards need this: `place` is the one part that can be
 *  arbitrarily long (records written by other clients hold a whole reverse-geocoded
 *  address in the name field), while `context` is a town and a region and is always
 *  short.
 *
 *  Rendering the joined string and eliding the WHOLE thing would cut the town off
 *  the end — which is the "town disappears" failure the deleted length budget had,
 *  arrived at from the other direction. So `place` is the only part a reader should
 *  ever truncate, and it can only be truncated by something that knows the real
 *  width. That is CSS, not this module.
 *
 *  `place` is the name when there is one and the STREET otherwise. A venue name
 *  identifies a place better, so it wins where both exist. But a record with only a
 *  street has the street as its only identifier, and showing just the town for it
 *  ("Berlin" for an event at Hermannstraße 162) drops the one detail that says
 *  where to go. 696 records in the index are that shape, and every one of them
 *  read as a bare town before this.
 *
 *  `context` also carries the bare-point fallback, so joining the two always
 *  reproduces the label exactly. */
export function locationShortParts(
	locations: ReadonlyArray<LocationEntry> | undefined | null
): { place?: string; context: string[] } | null {
	const summary = locationSummary(locations);
	if (!summary) return null;

	const place = summary.name ?? summary.street;
	const context = withoutRepeats(place, [summary.locality, summary.region]);
	if (!place && context.length === 0) {
		const point = formatPoint(summary.lat, summary.lng);
		return point ? { context: [point] } : null;
	}
	return { ...(place && { place }), context };
}

/** The location string for a reader with room for all of it (the calendar
 *  exports). Never trimmed, and it carries the name and the country the short
 *  label drops: a calendar app wants the whole address in LOCATION. */
export function locationFullLabel(
	locations: ReadonlyArray<LocationEntry> | undefined | null
): string | undefined {
	const summary = locationSummary(locations);
	if (!summary) return undefined;

	const context = withoutRepeats(summary.name, [
		summary.street,
		summary.locality,
		summary.region,
		summary.country
	]);
	const parts = summary.name ? [summary.name, ...context] : context;
	return parts.length > 0 ? parts.join(', ') : formatPoint(summary.lat, summary.lng) || undefined;
}

/** Normalize a record's `locations[]` into the fields a reader displays, folding
 *  the address entry and the companion geo entry. Returns null when there is no
 *  address or (named/located) geo entry to show — e.g. an FSQ/H3-only record. */
export function locationSummary(
	locations: ReadonlyArray<LocationEntry> | undefined | null
): LocationSummary | null {
	if (!locations?.length) return null;

	const address = locations.find((l) => l?.$type === ADDRESS_TYPE);
	const geo = locations.find((l) => l?.$type === GEO_TYPE);

	// Assign conditionally: setting a key to undefined would still create it, and an
	// entry present but empty would then read as something to show.
	const summary: LocationSummary = {};
	const set = (key: keyof LocationSummary, value: string | undefined) => {
		if (value) summary[key] = value;
	};
	if (address) {
		set('name', cleanName(str(address, 'name')));
		set('street', str(address, 'street'));
		set('locality', str(address, 'locality'));
		set('region', str(address, 'region'));
		set('country', str(address, 'country'));
	}
	if (geo) {
		if (!summary.name) set('name', cleanName(str(geo, 'name')));
		set('lat', str(geo, 'latitude'));
		set('lng', str(geo, 'longitude'));
	}

	return Object.keys(summary).length > 0 ? summary : null;
}
