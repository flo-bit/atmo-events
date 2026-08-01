// Pure mapping between /api/geocoding, editor state and a record's `locations[]`.
// Shared so the plain and recurring save paths cannot drift.
import type { EventLocation } from './types.js';

export const ADDRESS_TYPE = 'community.lexicon.location.address';
export const GEO_TYPE = 'community.lexicon.location.geo';

// A postal code is a code, not a name, whichever class carries it.
const POSTAL_TYPES = new Set(['postcode', 'postal_code']);

// ISO 3166-1 alpha-2, which is what both providers return, and the code the
// address lexicon wants. The subdivision fallback reads the country half of an
// ISO 3166-2 value ("US-IL" -> "US") from an `ISO3166-2` / `ISO3166-2-lvl4` key.
const COUNTRY_CODE = /^[A-Za-z]{2}$/;
const SUBDIVISION_KEY = /^ISO3166-2(-lvl\d+)?$/;
const SUBDIVISION_VALUE = /^([A-Za-z]{2})-\S+$/;

/** Normalized GET /api/geocoding result, never the raw provider object. `name` is
 *  the provider's feature name; category/placeType are its OSM class/type. */
export interface GeocodeResponse {
	lat?: number;
	lng?: number;
	label?: string;
	name?: string;
	category?: string;
	placeType?: string;
	address?: Record<string, string>;
}

function clean(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

// Do not let Number('') turn a blank coordinate into Null Island.
function coordFromString(v: unknown): number {
	if (typeof v !== 'string') return NaN;
	const s = v.trim();
	return s === '' ? NaN : Number(s);
}

/** Meilisearch drops the whole _geo batch on one invalid point. The single WGS84
 *  bound in this package: the readers import it so a point they will not write is
 *  also a point they will not display. */
export function coordsInRange(lat: number, lng: number): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= -90 &&
		lat <= 90 &&
		lng >= -180 &&
		lng <= 180
	);
}

/** Whether a point may be PINNED ON A MAP or linked to. Stricter than coordsInRange
 *  by exactly one point: 0,0 is valid WGS84 and the conventional "no data" sentinel,
 *  so records carry it for places nobody could geocode — atmo has such records today,
 *  with a perfectly good address in `name`. Pinning it drops the reader in the Gulf
 *  of Guinea and the address goes unused, so a reader that cannot trust the point
 *  should fall back to the address text.
 *
 *  DISPLAY ONLY. The write path still stores 0,0 if that is genuinely what was
 *  picked; this decides only whether a reader is willing to point at it. */
export function coordsUsableForDisplay(lat: number, lng: number): boolean {
	return coordsInRange(lat, lng) && !(lat === 0 && lng === 0);
}

/** The place name to store, or undefined. Always the geocoder's authoritative
 *  `name`, which is set only for genuinely named features — so an unnamed result
 *  (building=yes) yields none, and the display label, which for such a result is
 *  just a house number, is never used as a fallback.
 *
 *  A name that merely restates a field the record also stores is NOT dropped here.
 *  Readers already de-duplicate it (`dropRepeats` in location-summary.ts), and they
 *  have to: records authored by other clients carry the same repetition and are
 *  never rewritten. Deciding it a second time at write time only adds a way for the
 *  two answers to disagree — and to disagree in the direction that loses data, since
 *  a name dropped here is gone from the record for good. */
function resolvePlaceName(data: GeocodeResponse): string | undefined {
	const category = clean(data.category);
	const placeType = clean(data.placeType);
	// `name` alone cannot distinguish a venue from a city.
	if (!category && !placeType) return undefined;
	// A postal code is a code, not a name, whichever class carries it.
	if (POSTAL_TYPES.has(placeType)) return undefined;

	return clean(data.name) || undefined;
}

/** Resolve the ISO 3166 code for the address entry's required `country`. Both
 *  sources are the geocoder's own codes and both are shape-checked — nothing here
 *  guesses a code from the free-text country name, which stays out of scope (it
 *  needs a name->ISO map and a migration for the legacy records that carry one).
 *  Without either, the result states no country we can store, and
 *  buildLocationEntries emits no address entry rather than an invalid one. */
function resolveCountryCode(addr: Record<string, string>): string {
	const code = clean(addr.country_code);
	if (COUNTRY_CODE.test(code)) return code.toUpperCase();
	for (const [key, value] of Object.entries(addr)) {
		if (!SUBDIVISION_KEY.test(key)) continue;
		const match = SUBDIVISION_VALUE.exec(clean(value));
		if (match) return match[1].toUpperCase();
	}
	return '';
}

function resolveCoords(data: GeocodeResponse): { lat: number; lng: number } | undefined {
	const { lat, lng } = data;
	if (typeof lat === 'number' && typeof lng === 'number' && coordsInRange(lat, lng)) {
		return { lat, lng };
	}
	return undefined;
}

/** Map a geocoding response onto the editor's location state. */
export function geocodeResponseToLocation(data: GeocodeResponse): EventLocation {
	const addr = (data.address ?? {}) as Record<string, string>;
	const road = clean(addr.road);
	const houseNumber = clean(addr.house_number);
	const street = road ? (houseNumber ? `${road} ${houseNumber}` : road) : '';
	const locality =
		clean(addr.city) ||
		clean(addr.town) ||
		clean(addr.village) ||
		clean(addr.municipality) ||
		clean(addr.hamlet);
	const region = clean(addr.state) || clean(addr.county);
	// An ISO code, never the free-text country name, which may exceed the lexicon cap.
	const country = resolveCountryCode(addr);

	const coords = resolveCoords(data);
	const name = resolvePlaceName(data);

	return {
		...(name && { name }),
		...(street && { street }),
		...(locality && { locality }),
		...(region && { region }),
		...(country && { country }),
		...(coords && { coords })
	};
}

/** The lexicon's `country` is a CODE, not a name: "The ISO 3166 country code.
 *  Preferably the 2-letter code", min 2 bytes and max 10. So a country name is
 *  wrong there whether or not it fits, and "United States" does not even fit.
 *
 *  `geocodeResponseToLocation` already resolves a code for a geocoder pick, but it
 *  is not the only way a location reaches this module. A URL import maps
 *  schema.org `addressCountry` straight through, so "United States" arrived here
 *  verbatim and was written verbatim; reopening a legacy record carrying a
 *  free-text country did the same on re-save. Enforce it at the one place that
 *  emits the field instead, so no caller can get it wrong.
 *
 *  Only the 2-letter code is accepted, which is what both geocoders return and
 *  what the lexicon prefers. Turning a name into a code needs an ISO map and a
 *  migration for the legacy records, which is separate work — until then the field
 *  is left off, and the address entry goes out incomplete the same way it does for
 *  a pick with no code at all. */
function countryCode(value: string | undefined): string | undefined {
	const country = typeof value === 'string' ? value.trim() : '';
	return COUNTRY_CODE.test(country) ? country.toUpperCase() : undefined;
}

/** True when the address entry has something to carry. `name` alone does not
 *  count: with no field to anchor it, the name belongs on the geo entry. The
 *  country is the NORMALIZED one, so a location whose only field is an unusable
 *  country name does not produce an entry holding nothing but its `$type`. */
function hasAddressFields(location: EventLocation): boolean {
	return Boolean(
		location.street || location.locality || location.region || countryCode(location.country)
	);
}

/** Build an address entry when there is an address field to put in it, and a
 *  companion geo entry when coordinates are valid. Geo coordinates are strings;
 *  the address schema has no coordinate fields. */
export function buildLocationEntries(location: EventLocation): Array<Record<string, unknown>> {
	const entries: Array<Record<string, unknown>> = [];

	// `country` is required by the address lexicon, and both providers fill it for
	// anything with an administrative hierarchy. When it IS missing the entry is
	// written anyway, incomplete, rather than dropped: street, locality and region
	// have nowhere else to go — the geo entry holds coordinates and a name and has
	// no field for a town — so dropping the entry silently destroys a location the
	// user can see in the picker, permanently, on a record nothing will rewrite.
	//
	// This branch used to keep the incomplete entry only when there were NO
	// coordinates, on the grounds that a geo entry could carry the place instead. It
	// cannot: it carries the place's NAME. So {name, locality, region} kept its town
	// when saved without a point and lost it when saved with one — the same data,
	// two answers, decided by something unrelated. An entry missing one required
	// field is the smaller loss than three fields deleted, and it is a shape already
	// in the wild from other clients.
	//
	// Getting a country onto those values needs a name->ISO map and a migration for
	// the legacy records carrying a free-text one, which is separate work.
	if (hasAddressFields(location)) {
		const address: Record<string, unknown> = { $type: ADDRESS_TYPE };
		if (location.name) address.name = location.name;
		if (location.street) address.street = location.street;
		if (location.locality) address.locality = location.locality;
		if (location.region) address.region = location.region;
		const country = countryCode(location.country);
		if (country) address.country = country;
		entries.push(address);
	}

	// Validate at this emitting chokepoint too: public prefill can supply coords.
	if (location.coords && coordsInRange(location.coords.lat, location.coords.lng)) {
		const geo: Record<string, unknown> = {
			$type: GEO_TYPE,
			latitude: String(location.coords.lat),
			longitude: String(location.coords.lng)
		};
		// With no address entry to hold it, the place's name would be lost. The geo
		// lexicon has its own optional `name`, so it goes there instead — never on
		// both entries.
		if (entries.length === 0 && location.name) geo.name = location.name;
		entries.push(geo);
	}

	return entries;
}

/** Rebuild an EventLocation from a record's `locations[]` — the inverse of
 *  buildLocationEntries, used when an editor reopens a saved event. Reads the
 *  address entry's fields AND the companion geo entry's name and coordinates, so
 *  a re-save (and the recurring-event builder, which authors records from this
 *  location) preserves the searchable _geo instead of dropping it.
 *
 *  Only the address+geo pair this module authors is read back. Other entry kinds
 *  in `locations[]` (FSQ, H3, a second geo) have no editor state to land in and
 *  are left out — an explicit location change replaces the array, which is what
 *  you want, since those entries describe the place being replaced. */
export function eventLocationFromEntries(
	entries: ReadonlyArray<Record<string, unknown>> | undefined
): EventLocation {
	const location: EventLocation = {};
	if (!entries) return location;

	const str = (source: Record<string, unknown>, k: string): string | undefined => {
		const v = source[k];
		if (typeof v !== 'string') return undefined;
		// Return the TRIMMED value, not the raw one. Records hold hand-entered
		// fields with trailing spaces ("Copenhagen "); testing the trimmed value but
		// returning the raw one reopens the editor with the space still on it and
		// re-saves it, while every reader trims. Same rule as `str` in
		// location-summary.ts, which this has to agree with.
		const trimmed = v.trim();
		return trimmed ? trimmed : undefined;
	};

	const address = entries.find((e) => e?.$type === ADDRESS_TYPE);
	if (address) {
		const name = str(address, 'name');
		const street = str(address, 'street');
		const locality = str(address, 'locality');
		const region = str(address, 'region');
		const country = str(address, 'country');
		if (name) location.name = name;
		if (street) location.street = street;
		if (locality) location.locality = locality;
		if (region) location.region = region;
		if (country) location.country = country;
	}

	// Read the geo entry even with no address entry: a pick with nothing structured
	// to store — a place in international waters, or a result whose only address
	// keys are ones the mapper does not read — is a geo entry alone carrying the
	// place's name, and most records other clients write are that shape. Dropping it
	// on reopen would lose both the name and the event's _geo on the next re-save.
	const geo = entries.find((e) => e?.$type === GEO_TYPE);
	if (geo) {
		if (!location.name) {
			const name = str(geo, 'name');
			if (name) location.name = name;
		}
		const lat = coordFromString(geo.latitude);
		const lng = coordFromString(geo.longitude);
		if (coordsInRange(lat, lng)) location.coords = { lat, lng };
	}

	return location;
}

/** Decide the `locations[]` a save should write. On a new event or an explicit
 *  location change it is rebuilt from the edited model; otherwise the record's
 *  existing entries are preserved WHOLESALE — so entry kinds this editor doesn't
 *  model (FSQ, H3, a second geo) survive an edit, and survive a recurrence, that
 *  didn't touch the location, instead of being silently dropped by a rebuild from
 *  the reduced editor state. Returns undefined when there is nothing to write (a
 *  removed location, or an unchanged event that had none); the caller sets or
 *  deletes accordingly. Shared by save.ts and RecurringModal.svelte so the plain
 *  save and the recurrence can't diverge on this. */
export function locationsForSave(args: {
	isNew: boolean;
	locationChanged: boolean;
	location: EventLocation | null;
	existing: ReadonlyArray<Record<string, unknown>> | undefined;
}): Array<Record<string, unknown>> | undefined {
	const { isNew, locationChanged, location, existing } = args;
	if (isNew || locationChanged) {
		return location ? buildLocationEntries(location) : undefined;
	}
	return existing ? existing.map((entry) => ({ ...entry })) : undefined;
}
