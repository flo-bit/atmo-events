export type EventMode = 'inperson' | 'virtual' | 'hybrid';
export type Visibility = 'public' | 'private' | 'unlisted';

export interface EventLocation {
	street?: string;
	locality?: string;
	region?: string;
	country?: string;
}

export function stripModePrefix(modeStr: string): EventMode {
	const stripped = modeStr.replace('community.lexicon.calendar.event#', '');
	if (stripped === 'virtual' || stripped === 'hybrid' || stripped === 'inperson') return stripped;
	return 'inperson';
}

export function getLocationDisplayString(loc: EventLocation): string {
	return [loc.street, loc.locality, loc.region, loc.country].filter(Boolean).join(', ');
}
