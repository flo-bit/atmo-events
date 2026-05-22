export type EventMode = 'inperson' | 'virtual' | 'hybrid';
export type Visibility = 'public' | 'private' | 'unlisted';

export interface EventLocation {
	street?: string;
	locality?: string;
	region?: string;
	country?: string;
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
	return [loc.street, loc.locality, loc.region, loc.country].filter(Boolean).join(', ');
}
