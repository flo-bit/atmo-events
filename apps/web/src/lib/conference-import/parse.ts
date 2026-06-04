/**
 * Parse an uploaded talks file (CSV / TSV / JSON / YAML) into a flat list of
 * rows plus the union of column names. The mapping UI then maps those columns
 * onto talk-event fields. Kept format-agnostic on purpose so different
 * conferences can bring whatever export they already have.
 */
import yaml from 'js-yaml';

export type ImportFormat = 'csv' | 'json' | 'yaml';

export interface ParsedFile {
	format: ImportFormat;
	columns: string[];
	rows: Record<string, unknown>[];
}

export function detectFormat(filename: string, text: string): ImportFormat {
	const ext = filename.toLowerCase().split('.').pop();
	if (ext === 'json') return 'json';
	if (ext === 'yaml' || ext === 'yml') return 'yaml';
	if (ext === 'csv' || ext === 'tsv') return 'csv';
	// Sniff: JSON/YAML docs usually start with a bracket/brace; otherwise CSV.
	const head = text.trimStart();
	if (head.startsWith('[') || head.startsWith('{')) return 'json';
	return 'csv';
}

export function parseFile(filename: string, text: string): ParsedFile {
	const format = detectFormat(filename, text);
	let rows: Record<string, unknown>[];
	if (format === 'json') {
		rows = coerceRows(JSON.parse(text));
	} else if (format === 'yaml') {
		rows = coerceRows(yaml.load(text));
	} else {
		rows = parseCsv(text);
	}
	return { format, columns: unionKeys(rows), rows };
}

/** Accept an array of objects, or an object wrapping one (talks/events/…). */
function coerceRows(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) {
		return data.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
	}
	if (data && typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		for (const key of ['talks', 'events', 'sessions', 'schedule', 'items', 'rows']) {
			if (Array.isArray(obj[key])) {
				return (obj[key] as unknown[]).filter(
					(r): r is Record<string, unknown> => !!r && typeof r === 'object'
				);
			}
		}
		return [obj];
	}
	return [];
}

function unionKeys(rows: Record<string, unknown>[]): string[] {
	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
	return [...seen];
}

/** Parse CSV/TSV into row objects keyed by the header row. */
export function parseCsv(text: string): Record<string, unknown>[] {
	const records = parseDelimited(text);
	if (records.length === 0) return [];
	const header = records[0].map((h) => h.trim());
	const rows: Record<string, unknown>[] = [];
	for (let i = 1; i < records.length; i++) {
		const rec = records[i];
		// Skip fully blank lines.
		if (rec.length === 1 && rec[0].trim() === '') continue;
		const row: Record<string, unknown> = {};
		header.forEach((h, j) => {
			row[h] = rec[j] ?? '';
		});
		rows.push(row);
	}
	return rows;
}

/** Minimal RFC-4180-style parser: handles quoted fields, escaped quotes ("")
 *  and CRLF/LF. Auto-detects tab vs comma delimiter. */
function parseDelimited(text: string): string[][] {
	const delimiter = text.includes('\t') && !text.includes(',') ? '\t' : ',';
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === delimiter) {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (c !== '\r') {
			field += c;
		}
	}
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
