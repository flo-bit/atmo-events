// The one display bound for coordinates, shared with every reader outside the
// editor. `location.ts` imports EventLocation back from here, but that side is
// `import type` and erases at build, so this is a types-only cycle with no runtime
// edge — and no import is added to the server chain, which reaches `location.ts`
// directly and never loads this module.
import { coordsUsableForDisplay } from './location.js';
import { dropRepeats } from '../location-summary.js';

export type EventMode = 'inperson' | 'virtual' | 'hybrid';
export type Visibility = 'public' | 'private' | 'unlisted';

export interface EventLocationCoords {
	lat: number;
	lng: number;
}

export interface EventLocation {
	/**
	 * The picked place's own name (e.g. "Humboldt Park", "Alinea"), when the
	 * geocoder result has one that the address fields don't already state. A named
	 * area counts, not just a venue.
	 */
	name?: string;
	street?: string;
	locality?: string;
	region?: string;
	country?: string;
	/**
	 * Geocoder coordinates for the picked place. Kept OFF the address entry (the
	 * lexicon address has no lat/lng) and emitted as a companion geo entry by
	 * {@link buildLocationEntries}, so authored records carry a searchable _geo.
	 */
	coords?: EventLocationCoords;
}

/**
 * Optional autofill payload for a brand-new event. EventEditor populates its
 * fields from this on mount (only when there is no `eventData`), while leaving
 * `isNew` true so the save path still treats the result as a creation. Use
 * `additionalData` to carry atmo-specific extras (e.g. an external source link
 * + rsvp mode) into the saved record.
 */
export interface EventEditorPrefill {
	name?: string;
	description?: string;
	/** ISO 8601 string. */
	startsAt?: string;
	/** ISO 8601 string. */
	endsAt?: string;
	timezone?: string;
	mode?: EventMode;
	location?: EventLocation;
	links?: Array<{ uri: string; name: string }>;
	additionalData?: Record<string, unknown>;
	/**
	 * Pre-supplied cover image. When set, the editor uses this instead of
	 * auto-generating a preset thumbnail and the file is uploaded as a blob on
	 * save.
	 */
	thumbnailFile?: File;
}

export function stripModePrefix(modeStr: string): EventMode {
	const stripped = modeStr.replace('community.lexicon.calendar.event#', '');
	if (stripped === 'virtual' || stripped === 'hybrid' || stripped === 'inperson') return stripped;
	return 'inperson';
}

export function getLocationDisplayString(loc: EventLocation): string {
	// De-duplicated with `dropRepeats`, the SAME rule every reader outside the editor
	// applies — not a second copy of it. A city result names its own locality and a
	// road result its own street, so joining the name and the fields blindly showed
	// "Chicago, Chicago, Illinois, US" and "North Halsted Street, North Halsted
	// Street, Chicago, ..." in the search results and the selected-location block,
	// while the card for the very same pick showed "Chicago, Illinois". The editor is
	// where the user checks what they picked; it has to agree with what they will see.
	const context = dropRepeats(loc.name, [loc.street, loc.locality, loc.region, loc.country]).filter(
		(v): v is string => Boolean(v)
	);
	const parts = loc.name ? [loc.name, ...context] : context;
	if (parts.length > 0) return parts.join(', ');
	// A pick the geocoder gave no ISO country code for is stored as coordinates
	// only — the address lexicon requires a country — so show the point instead of
	// an empty label. Rounded for display; the stored coordinates are untouched.
	//
	// Held to the DISPLAY bound, so the 0,0 sentinel yields '' here exactly as it
	// does in `formatPoint` for every other reader. Without this the editor was the
	// last place that still rendered "0.00000, 0.00000" as though it were a place,
	// while the card, the event page, the map link and both calendar exports had
	// stopped. The WRITE path deliberately keeps the looser `coordsInRange` bound:
	// this hides the sentinel, it must never delete it.
	if (loc.coords && coordsUsableForDisplay(loc.coords.lat, loc.coords.lng)) {
		return `${loc.coords.lat.toFixed(5)}, ${loc.coords.lng.toFixed(5)}`;
	}
	return '';
}
