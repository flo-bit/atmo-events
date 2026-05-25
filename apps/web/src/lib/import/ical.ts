import type { EventImportPrefill } from '$lib/import-event';
import type { EventImporter } from './types';
import { offsetForZone } from './util';

type IcalEvent = Omit<EventImportPrefill, 'source'>;

/**
 * Importer for URLs that are themselves an iCalendar feed (`text/calendar`, or a
 * body starting with `BEGIN:VCALENDAR`). HTML pages that merely *link* to an
 * .ics are handled by the webpage importer, which reuses `parseIcal` below.
 */
export const icalImporter: EventImporter = {
	name: 'ical',
	async accept(ctx) {
		const page = await ctx.getPage();
		return (
			page.contentType.includes('text/calendar') ||
			/^BEGIN:VCALENDAR/m.test(page.text.slice(0, 200))
		);
	},
	async parseData(ctx) {
		const page = await ctx.getPage();
		const ical = parseIcal(page.text);
		return ical ? { source: page.finalUrl, ...ical } : null;
	}
};

/** Parse the first VEVENT out of an iCalendar document. */
export function parseIcal(text: string): IcalEvent | null {
	const unfolded = text.replace(/\r?\n[ \t]/g, '');
	const lines = unfolded.split(/\r?\n/);

	let inEvent = false;
	const fields: Record<string, { params: Record<string, string>; value: string }> = {};

	for (const raw of lines) {
		if (raw === 'BEGIN:VEVENT') {
			inEvent = true;
			continue;
		}
		if (raw === 'END:VEVENT') break;
		if (!inEvent) continue;

		const colonIdx = raw.indexOf(':');
		if (colonIdx < 0) continue;
		const left = raw.slice(0, colonIdx);
		const value = raw.slice(colonIdx + 1);
		const parts = left.split(';');
		const name = parts[0].toUpperCase();
		const params: Record<string, string> = {};
		for (let i = 1; i < parts.length; i++) {
			const eq = parts[i].indexOf('=');
			if (eq > 0) {
				params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
			}
		}
		fields[name] = { params, value };
	}

	if (Object.keys(fields).length === 0) return null;

	const out: IcalEvent = {};
	const summary = fields.SUMMARY?.value;
	if (summary) out.name = unescapeIcal(summary);
	const description = fields.DESCRIPTION?.value;
	if (description) out.description = unescapeIcal(description);
	const url = fields.URL?.value;
	if (url) out.links = [{ uri: url, name: 'Event page' }];

	const start = fields.DTSTART;
	if (start) {
		const iso = icalDateToIso(start.value, start.params.TZID);
		if (iso) out.startsAt = iso;
		if (start.params.TZID) out.timezone = start.params.TZID;
	}
	const end = fields.DTEND;
	if (end) {
		const iso = icalDateToIso(end.value, end.params.TZID);
		if (iso) out.endsAt = iso;
	}

	const location = fields.LOCATION?.value;
	if (location) {
		out.location = { street: unescapeIcal(location) };
	}

	return out;
}

function unescapeIcal(s: string): string {
	return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function icalDateToIso(value: string, tzid?: string): string | undefined {
	// All-day: YYYYMMDD
	const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (dateOnly) {
		return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`;
	}
	// UTC: YYYYMMDDTHHMMSSZ
	const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (utc) {
		return `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`;
	}
	// Local: YYYYMMDDTHHMMSS (interpret in TZID if present)
	const local = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
	if (local) {
		const base = `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6]}`;
		if (!tzid) return base;
		// Compute offset for that wall time in tzid.
		const offset = offsetForZone(tzid, base);
		return offset ? `${base}${offset}` : base;
	}
	return undefined;
}
