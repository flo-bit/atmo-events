/**
 * Turn a parsed file row into a talk event record, given a user-defined field
 * mapping and the conference (uri / rkey / timezone). Times are parsed
 * tolerantly (full ISO, "YYYY-MM-DD HH:mm", "9:00 AM", separate date + time
 * columns, or a duration) and interpreted in the conference timezone unless an
 * explicit offset is present. Returns validation errors per row so the UI can
 * preview before anything is written.
 */
import { datetimeLocalToISO } from '@atmo-dev/events-ui/date-format';

export const EVENT_COLLECTION = 'community.lexicon.calendar.event';

export interface FieldMapping {
	name?: string;
	type?: string;
	/** Constant type used when no type column is mapped (or a row's cell is blank). */
	typeDefault?: string;
	room?: string;
	description?: string;
	/** Stable id column → deterministic rkey (re-upload updates in place). */
	id?: string;
	/** Optional separate date column, combined with start/end time cells. */
	date?: string;
	start?: string;
	end?: string;
	/** Duration in minutes; alternative to an end column. */
	duration?: string;
	speakers?: string;
	speakerDelimiter?: string;
	extractHandles?: boolean;
}

export interface Conference {
	uri: string;
	rkey: string;
	tz: string;
}

export interface Speaker {
	name: string;
	id?: string;
}

export interface BuiltTalk {
	/** Set when an id column is mapped → upsert via putRecord; else createRecord. */
	rkey?: string;
	record: Record<string, unknown>;
	preview: {
		name: string;
		type: string;
		room?: string;
		startsAt?: string;
		endsAt?: string;
		speakers: Speaker[];
		id?: string;
	};
	errors: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');

function cell(row: Record<string, unknown>, col?: string): unknown {
	if (!col) return undefined;
	return row[col];
}

function str(row: Record<string, unknown>, col?: string): string {
	const v = cell(row, col);
	return v == null ? '' : String(v).trim();
}

function normalizeDate(s: string): string {
	const m = s.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
	return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : '';
}

/** Normalize a time string to "HH:mm", or null if unparseable. */
function normalizeTime(s: string): string | null {
	s = s.trim();
	let m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
	if (m) {
		let h = +m[1];
		const min = +m[2];
		const ap = m[3]?.toLowerCase();
		if (ap === 'pm' && h < 12) h += 12;
		if (ap === 'am' && h === 12) h = 0;
		return `${pad(h)}:${pad(min)}`;
	}
	m = s.match(/^(\d{1,2})\s*([AaPp][Mm])$/);
	if (m) {
		let h = +m[1];
		const ap = m[2].toLowerCase();
		if (ap === 'pm' && h < 12) h += 12;
		if (ap === 'am' && h === 12) h = 0;
		return `${pad(h)}:00`;
	}
	m = s.match(/^(\d{2})(\d{2})$/);
	if (m) return `${m[1]}:${m[2]}`;
	m = s.match(/^(\d{1,2})$/);
	if (m) return `${pad(+m[1])}:00`;
	return null;
}

/** Parse a (date, time) pair into a UTC ISO instant, interpreted in `tz`. */
function parseWhen(
	dateRaw: string,
	timeRaw: string,
	tz: string
): { iso?: string; error?: string } {
	const raw = timeRaw.trim();
	if (!raw && !dateRaw) return { error: 'missing time' };

	// Explicit offset / Z → an absolute instant, use as-is.
	if (/(\d{2}:?\d{2}|[zZ])$/.test(raw) && /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
		const d = new Date(raw);
		if (isNaN(d.getTime())) return { error: `unparseable datetime "${raw}"` };
		return { iso: d.toISOString() };
	}

	let datePart = normalizeDate(dateRaw);
	let timePart: string | null = '';

	const combined = raw.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})[ T](.+)$/);
	if (combined) {
		datePart = normalizeDate(combined[1]);
		timePart = normalizeTime(combined[2]);
	} else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw) && !dateRaw) {
		datePart = normalizeDate(raw);
		timePart = '00:00';
	} else {
		timePart = normalizeTime(raw);
	}

	if (!datePart) return { error: 'missing or unparseable date' };
	if (timePart == null) return { error: `unparseable time "${raw}"` };

	try {
		return { iso: datetimeLocalToISO(`${datePart}T${timePart}`, tz) };
	} catch {
		return { error: `bad date/time "${datePart}T${timePart}"` };
	}
}

function parseSpeakerString(s: string, extractHandles: boolean): Speaker | null {
	const trimmed = s.trim();
	if (!trimmed) return null;
	if (extractHandles) {
		const m = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
		if (m && m[1].trim()) return { name: m[1].trim(), id: m[2].trim() };
	}
	return { name: trimmed };
}

function parseSpeakers(value: unknown, delimiter: string, extractHandles: boolean): Speaker[] {
	if (Array.isArray(value)) {
		return value
			.map((v): Speaker | null => {
				if (typeof v === 'string') return parseSpeakerString(v, extractHandles);
				if (v && typeof v === 'object') {
					const o = v as Record<string, unknown>;
					const name = String(o.name ?? o.displayName ?? '').trim();
					const id = (o.id ?? o.handle ?? o.did) as string | undefined;
					return name ? { name, ...(id ? { id: String(id) } : {}) } : null;
				}
				return null;
			})
			.filter((s): s is Speaker => !!s);
	}
	const text = value == null ? '' : String(value);
	if (!text.trim()) return [];
	return text
		.split(delimiter || ';')
		.map((s) => parseSpeakerString(s, extractHandles))
		.filter((s): s is Speaker => !!s);
}

/** Deterministic, conference-scoped rkey from a stable id (for upsert). */
export function deterministicRkey(conferenceRkey: string, id: string): string | undefined {
	const slug = id
		.toLowerCase()
		.replace(/[^a-z0-9._~-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	if (!slug) return undefined;
	return `${conferenceRkey}-${slug}`.slice(0, 80);
}

export function buildTalk(
	row: Record<string, unknown>,
	mapping: FieldMapping,
	conf: Conference
): BuiltTalk {
	const errors: string[] = [];

	const name = str(row, mapping.name);
	if (!name) errors.push('missing name');

	const typeCell = str(row, mapping.type);
	const type = typeCell || mapping.typeDefault || 'talk';
	const room = str(row, mapping.room) || undefined;
	const description = str(row, mapping.description) || undefined;
	const id = str(row, mapping.id) || undefined;

	const dateRaw = str(row, mapping.date);
	const start = parseWhen(dateRaw, str(row, mapping.start), conf.tz);
	if (start.error) errors.push(`start: ${start.error}`);

	let endsAt: string | undefined;
	if (mapping.duration) {
		const mins = parseFloat(str(row, mapping.duration));
		if (start.iso && Number.isFinite(mins) && mins > 0) {
			endsAt = new Date(new Date(start.iso).getTime() + mins * 60_000).toISOString();
		}
	} else if (mapping.end) {
		const end = parseWhen(dateRaw, str(row, mapping.end), conf.tz);
		if (end.error) errors.push(`end: ${end.error}`);
		endsAt = end.iso;
	}

	const speakers = mapping.speakers
		? parseSpeakers(cell(row, mapping.speakers), mapping.speakerDelimiter ?? ';', mapping.extractHandles ?? true)
		: [];

	const additionalData: Record<string, unknown> = {
		type,
		parentEvent: { uri: conf.uri }
	};
	if (room) additionalData.room = room;
	if (speakers.length) additionalData.speakers = speakers;

	const record: Record<string, unknown> = {
		$type: EVENT_COLLECTION,
		createdAt: new Date().toISOString(),
		name,
		startsAt: start.iso ?? '',
		timezone: conf.tz,
		additionalData
	};
	if (description) record.description = description;
	if (endsAt) record.endsAt = endsAt;

	return {
		rkey: id ? deterministicRkey(conf.rkey, id) : undefined,
		record,
		preview: { name, type, room, startsAt: start.iso, endsAt, speakers, id },
		errors
	};
}

/** Auto-pick a column whose normalized name matches one of `candidates`. */
export function autoDetect(columns: string[], candidates: string[]): string | undefined {
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const cols = columns.map((c) => ({ raw: c, n: norm(c) }));
	for (const cand of candidates) {
		const cn = norm(cand);
		const exact = cols.find((c) => c.n === cn);
		if (exact) return exact.raw;
	}
	for (const cand of candidates) {
		const cn = norm(cand);
		const partial = cols.find((c) => c.n.includes(cn));
		if (partial) return partial.raw;
	}
	return undefined;
}
