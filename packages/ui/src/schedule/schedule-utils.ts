import type { ScheduleEvent } from '../conference.js';

export type { ScheduleEvent };

export interface GridEvent extends ScheduleEvent {
	startMin: number;
	endMin: number;
	startRow: number;
	spanRows: number;
	colStart: number;
	colSpan: number;
	zIndex: number;
}

export interface GridData {
	gridEvents: GridEvent[];
	minTime: number;
	totalSlots: number;
	timeGridRows: string;
}

export const SLOT = 5;
export const SLOT_HEIGHT = '0.6rem';

export const linkableTypes = new Set([
	'talk',
	'presentation',
	'workshop',
	'lightning-talk',
	'panel'
]);

export function isLightning(type: string): boolean {
	return type === 'lightning-talk';
}

export function isCompact(durationMin: number, type: string): boolean {
	return type === 'lightning-talk' || durationMin <= 15;
}

/**
 * Wall-clock components of an instant as seen in `tz`, returned as a Date built
 * from those local parts (so getHours()/getMinutes() read the tz time, not the
 * runtime's). Used to lay the grid out in the conference's own timezone.
 */
export function toTzDate(iso: string, tz: string): Date {
	const date = new Date(iso);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(date);
	const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0');
	return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}

export function isoToMinutes(iso: string, tz: string): number {
	const d = toTzDate(iso, tz);
	return d.getHours() * 60 + d.getMinutes();
}

export function formatTime(iso: string, tz: string): string {
	return new Date(iso).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone: tz
	});
}

/** Hour label for a "minutes since midnight" value (0–1439). Timezone-agnostic. */
export function formatHour(minutes: number): string {
	const h = Math.floor(minutes / 60) % 24;
	const p = h >= 12 ? 'PM' : 'AM';
	const display = h % 12 === 0 ? 12 : h % 12;
	return `${display}${p}`;
}

export function getDayKey(iso: string, tz: string): string {
	const d = toTzDate(iso, tz);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDayLabel(iso: string, tz: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		timeZone: tz,
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}

export function getDayShortLabel(iso: string, tz: string): string {
	return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
}

export function getEventColor(type: string): string {
	switch (type) {
		case 'info':
			return 'bg-base-200 dark:bg-base-800 text-base-700 dark:text-base-300';
		case 'workshop':
			return 'bg-cyan-100 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-200';
		case 'lightning-talk':
			return 'bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200';
		case 'panel':
			return 'bg-violet-100 dark:bg-violet-950 text-violet-900 dark:text-violet-200';
		case 'activity':
			return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200';
		default:
			return 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200';
	}
}

export function durationMinutes(start: string, end: string | undefined, tz: string): number {
	if (!end) return 30;
	return isoToMinutes(end, tz) - isoToMinutes(start, tz);
}

/** Rooms present in a set of events, in display order. */
export function getRooms(events: ScheduleEvent[], explicitOrder?: string[]): string[] {
	const present = new Set<string>();
	for (const e of events) {
		if (e.room && e.room !== 'none' && e.type !== 'info') present.add(e.room);
	}
	if (explicitOrder?.length) {
		// Honour the declared order, then append any rooms not in the list.
		const ordered = explicitOrder.filter((r) => present.has(r));
		const extra = [...present].filter((r) => !explicitOrder.includes(r)).sort();
		return [...ordered, ...extra];
	}
	return [...present].sort();
}

export function buildGrid(events: ScheduleEvent[], rooms: string[], tz: string): GridData {
	const parsed = events
		.filter((e) => e.start && e.title?.trim())
		.map((e) => {
			const startMin = isoToMinutes(e.start, tz);
			const endMin = e.end ? isoToMinutes(e.end, tz) : startMin + 30;
			return { ...e, startMin, endMin };
		});

	const gridRelevant = parsed.filter((e) => e.type === 'info' || rooms.includes(e.room || ''));

	if (gridRelevant.length === 0)
		return { gridEvents: [], minTime: 0, totalSlots: 0, timeGridRows: '' };

	const minTime = Math.floor(Math.min(...gridRelevant.map((e) => e.startMin)) / SLOT) * SLOT;
	const maxTime = Math.ceil(Math.max(...gridRelevant.map((e) => e.endMin)) / SLOT) * SLOT;
	const totalSlots = (maxTime - minTime) / SLOT;

	// Collapse duplicate "doors open"-style info rows that share a start time
	// with another info event, so they don't stack on top of each other.
	const infoStartTimes = new Map<number, number>();
	for (const e of gridRelevant) {
		if (e.type === 'info') infoStartTimes.set(e.startMin, (infoStartTimes.get(e.startMin) ?? 0) + 1);
	}
	const filteredRelevant = gridRelevant.filter((e) => {
		if (
			e.type === 'info' &&
			/doors\s*open/i.test(e.title) &&
			(infoStartTimes.get(e.startMin) ?? 0) > 1
		)
			return false;
		return true;
	});

	// Trim each info banner's end so consecutive ones don't overlap.
	const infoEvents = filteredRelevant
		.filter((e) => e.type === 'info')
		.sort((a, b) => a.startMin - b.startMin);
	for (let i = 0; i < infoEvents.length - 1; i++) {
		const next = infoEvents[i + 1];
		if (infoEvents[i].endMin > next.startMin) {
			infoEvents[i].endMin = next.startMin;
		}
	}

	const gridEvents = filteredRelevant.map((e) => {
		const fullWidth = e.type === 'info';
		return {
			...e,
			startRow: Math.round((e.startMin - minTime) / SLOT) + 2,
			spanRows: Math.max(1, Math.round((e.endMin - e.startMin) / SLOT)),
			colStart: fullWidth ? 1 : rooms.indexOf(e.room!) + 1,
			colSpan: fullWidth ? rooms.length : 1,
			zIndex: fullWidth ? 0 : e.startMin
		};
	});

	const timeGridRows = `grid-template-rows: 0.5rem repeat(${totalSlots}, ${SLOT_HEIGHT})`;

	return { gridEvents, minTime, totalSlots, timeGridRows };
}

export function getNowGridRow(
	grid: GridData,
	dayKey: string,
	nowKey: string,
	nowMinutes: number
): { row: number; offsetPercent: number } | null {
	if (grid.totalSlots === 0 || nowKey !== dayKey) return null;
	const exactSlot = (nowMinutes - grid.minTime) / SLOT;
	const row = Math.floor(exactSlot) + 2;
	const offsetPercent = (exactSlot - Math.floor(exactSlot)) * 100;
	if (row < 2 || row > grid.totalSlots + 2) return null;
	return { row, offsetPercent };
}
