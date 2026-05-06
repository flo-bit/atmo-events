import { parseAbsolute, parseDateTime } from '@internationalized/date';

/**
 * Convert a datetime-local string (e.g. "2026-04-09T22:00") to a UTC ISO string,
 * interpreting the wall-clock components in the given IANA timezone.
 */
export function datetimeLocalToISO(dt: string, tz: string): string {
	return parseDateTime(dt).toDate(tz).toISOString();
}

/**
 * Convert a UTC ISO string to a datetime-local string ("YYYY-MM-DDTHH:mm") whose
 * components represent the wall-clock time in the given IANA timezone.
 */
export function isoToDatetimeLocalInTz(iso: string, tz: string): string {
	const zdt = parseAbsolute(iso, tz);
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)}T${pad(zdt.hour)}:${pad(zdt.minute)}`;
}

/**
 * Format an ISO timestamp using Intl options, rendered in the event's timezone
 * when available. Falls back to the viewer's local zone for legacy events that
 * predate the timezone field.
 */
export function formatInTz(
	iso: string,
	tz: string | undefined,
	options: Intl.DateTimeFormatOptions,
	locale: string = 'en-US'
): string {
	const date = new Date(iso);
	return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz || undefined }).format(date);
}

/**
 * Returns the parts of an ISO timestamp in the given timezone (or viewer-local
 * when tz is falsy). Useful when the caller wants numeric components like the
 * day-of-month rendered in the event's zone.
 */
export function partsInTz(
	iso: string,
	tz: string | undefined,
	options: Intl.DateTimeFormatOptions,
	locale: string = 'en-US'
): Record<string, string> {
	const date = new Date(iso);
	const parts = new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: tz || undefined
	}).formatToParts(date);
	const out: Record<string, string> = {};
	for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
	return out;
}
