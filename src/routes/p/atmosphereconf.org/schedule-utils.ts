import type { FlatEventRecord } from '$lib/contrail';

export interface ScheduleEvent {
	rkey: string;
	title: string;
	type: string;
	speakers?: Array<{ id?: string; name: string }>;
	start: string;
	end?: string;
	room?: string;
	description?: string;
	did: string;
	uri: string;
	cid?: string | null;
}

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

const TZ = 'America/Vancouver';
export const SLOT = 5;
export const SLOT_HEIGHT = '0.6rem';

export const linkableTypes = new Set(['workshop', 'presentation', 'lightning-talk', 'panel']);

export function isLightning(type: string): boolean {
	return type === 'lightning-talk';
}

export function isCompact(type: string, start: string, end?: string): boolean {
	return type === 'lightning-talk' || durationMinutes(start, end) <= 15;
}

export function toVancouverDate(iso: string): Date {
	const date = new Date(iso);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TZ,
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

export function isoToMinutes(iso: string): number {
	const d = toVancouverDate(iso);
	return d.getHours() * 60 + d.getMinutes();
}

export function formatTime(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

export function formatHour(vancouverMinutes: number): string {
	const refDate = new Date('2026-03-28T00:00:00-07:00');
	const ms = refDate.getTime() + vancouverMinutes * 60 * 1000;
	const d = new Date(ms);
	const h = d.getHours();
	const p = h >= 12 ? 'PM' : 'AM';
	const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
	return `${display}${p}`;
}

export function getDayKey(iso: string): string {
	const d = toVancouverDate(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDayLabel(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		timeZone: 'America/Vancouver',
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
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

export function durationMinutes(start: string, end?: string): number {
	if (!end) return 30;
	return isoToMinutes(end) - isoToMinutes(start);
}

export function getScheduleEvents(events: FlatEventRecord[]): ScheduleEvent[] {
	return events
		.filter(
			(e) =>
				e.additionalData &&
				(e.additionalData as Record<string, unknown>).isAtmosphereconf
		)
		.map((e) => {
			const ad = (e.additionalData ?? {}) as Record<string, unknown>;
			return {
				rkey: e.rkey,
				title: e.name,
				type: (ad.type as string) ?? 'presentation',
				speakers: ad.speakers as Array<{ id?: string; name: string }> | undefined,
				start: e.startsAt,
				end: e.endsAt,
				room: ad.room as string | undefined,
				description: e.description,
				did: e.did,
				uri: e.uri,
				cid: e.cid
			};
		})
		.sort((a, b) => a.start.localeCompare(b.start));
}

export function getRooms(events: ScheduleEvent[]): string[] {
	const rooms = new Set<string>();
	for (const e of events) {
		if (e.room && e.room !== 'none' && e.type !== 'info') rooms.add(e.room);
	}
	return [...rooms].sort();
}

export function buildGrid(events: ScheduleEvent[], rooms: string[]): GridData {
	const parsed = events
		.filter((e) => e.start && e.title?.trim() && e.rkey !== 'day-3-slot-3-c')
		.map((e) => {
			const startMin = isoToMinutes(e.start);
			const endMin = e.end ? isoToMinutes(e.end) : startMin + 30;
			return { ...e, startMin, endMin };
		});

	const gridRelevant = parsed.filter((e) => e.type === 'info' || rooms.includes(e.room || ''));

	if (gridRelevant.length === 0)
		return { gridEvents: [], minTime: 0, totalSlots: 0, timeGridRows: '' };

	const minTime = Math.floor(Math.min(...gridRelevant.map((e) => e.startMin)) / SLOT) * SLOT;
	const maxTime = Math.ceil(Math.max(...gridRelevant.map((e) => e.endMin)) / SLOT) * SLOT;
	const totalSlots = (maxTime - minTime) / SLOT;

	// Remove "Doors Open" events that share a start time with another info event
	const infoStartTimes = new Map<number, number>();
	for (const e of gridRelevant) {
		if (e.type === 'info') infoStartTimes.set(e.startMin, (infoStartTimes.get(e.startMin) ?? 0) + 1);
	}
	const filteredRelevant = gridRelevant.filter((e) => {
		if (e.type === 'info' && /doors\s*open/i.test(e.title) && (infoStartTimes.get(e.startMin) ?? 0) > 1) return false;
		return true;
	});

	// For info events, trim their end time so they don't overlap with the next info event
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
	nowVancouverKey: string,
	nowVancouverMinutes: number
): { row: number; offsetPercent: number } | null {
	if (grid.totalSlots === 0 || nowVancouverKey !== dayKey) return null;
	const exactSlot = (nowVancouverMinutes - grid.minTime) / SLOT;
	const row = Math.floor(exactSlot) + 2;
	const offsetPercent = (exactSlot - Math.floor(exactSlot)) * 100;
	if (row < 2 || row > grid.totalSlots + 2) return null;
	return { row, offsetPercent };
}
