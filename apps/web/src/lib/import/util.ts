export function asString(v: unknown): string | undefined {
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function stripHtml(s: string | undefined): string | undefined {
	if (!s) return undefined;
	return s
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function normalizeIso(s: string): string {
	// Date.parse handles most ISO variants; re-emit canonical form when we can.
	const ms = Date.parse(s);
	if (Number.isNaN(ms)) return s;
	// Preserve the original offset when present (Date.parse → toISOString gives UTC).
	if (/[+-]\d{2}:?\d{2}$|Z$/.test(s)) return s;
	return new Date(ms).toISOString();
}

/** Format the UTC offset (e.g. "+02:00") of `tz` at the given naive wall time. */
export function offsetForZone(tz: string, isoNoOffset: string): string | undefined {
	try {
		const ms = Date.parse(isoNoOffset + 'Z');
		if (Number.isNaN(ms)) return undefined;
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			timeZoneName: 'shortOffset',
			hour: '2-digit'
		});
		const parts = dtf.formatToParts(new Date(ms));
		const name = parts.find((p) => p.type === 'timeZoneName')?.value;
		const m = name?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
		if (!m) return undefined;
		const hours = parseInt(m[1], 10);
		const mins = m[2] ? parseInt(m[2], 10) : 0;
		const sign = hours >= 0 ? '+' : '-';
		const hh = String(Math.abs(hours)).padStart(2, '0');
		const mm = String(mins).padStart(2, '0');
		return `${sign}${hh}:${mm}`;
	} catch {
		return undefined;
	}
}

/**
 * Curated list of representative IANA zones we'll consider when guessing from
 * an ISO offset. Ordering matters — earlier entries win ties, so the most
 * commonly-meant zone for each offset bucket should come first.
 */
const ZONE_CANDIDATES = [
	'Pacific/Honolulu',
	'America/Anchorage',
	'America/Los_Angeles',
	'America/Denver',
	'America/Phoenix',
	'America/Chicago',
	'America/Mexico_City',
	'America/New_York',
	'America/Toronto',
	'America/Halifax',
	'America/Sao_Paulo',
	'America/Argentina/Buenos_Aires',
	'Atlantic/Azores',
	'UTC',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'Europe/Madrid',
	'Africa/Cairo',
	'Europe/Athens',
	'Europe/Moscow',
	'Asia/Dubai',
	'Asia/Karachi',
	'Asia/Kolkata',
	'Asia/Dhaka',
	'Asia/Bangkok',
	'Asia/Singapore',
	'Asia/Shanghai',
	'Asia/Tokyo',
	'Australia/Sydney',
	'Pacific/Auckland'
];

export function guessIanaZoneFromIsoOffset(iso: string): string | undefined {
	const m = iso.match(/([+-]\d{2}):?(\d{2})$|Z$/);
	if (!m) return undefined;
	const offsetMinutes = iso.endsWith('Z')
		? 0
		: (m[1].startsWith('-') ? -1 : 1) * (parseInt(m[1].slice(1), 10) * 60 + parseInt(m[2], 10));

	// Offset 0 is almost always a platform serializing as UTC because it didn't
	// track the authoring tz (Partiful does this). Returning "UTC" here would be
	// wrong far more often than right — leave it unset so the editor falls back
	// to the viewer's browser zone and they can correct it.
	if (offsetMinutes === 0) return undefined;

	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return undefined;

	for (const zone of ZONE_CANDIDATES) {
		if (zoneOffsetAt(zone, ms) === offsetMinutes) return zone;
	}
	return undefined;
}

function zoneOffsetAt(zone: string, ms: number): number | undefined {
	try {
		// Format the same instant as wall-clock parts in `zone`, reconstruct it
		// as if it were UTC, and the difference is the zone's offset at `ms`.
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
		const parts = Object.fromEntries(
			dtf.formatToParts(new Date(ms)).map((p) => [p.type, p.value])
		) as Record<string, string>;
		const asUtcMs = Date.UTC(
			Number(parts.year),
			Number(parts.month) - 1,
			Number(parts.day),
			Number(parts.hour) === 24 ? 0 : Number(parts.hour),
			Number(parts.minute),
			Number(parts.second)
		);
		return Math.round((asUtcMs - ms) / 60000);
	} catch {
		return undefined;
	}
}
