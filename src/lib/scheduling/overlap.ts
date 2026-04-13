import type { CandidateWindow, SlotCount } from './types';

/**
 * Find overlapping availability windows sized to the requested duration.
 *
 * Slides a duration-sized window across all slots and computes
 * the participant intersection at each position. This correctly handles
 * windows that span count boundaries (e.g., 3 people in slot 1,
 * 2 of the same people in slot 2 — still a valid 2-person window).
 */
export function mergeIntoWindows(
	slots: SlotCount[],
	slotMinutes: number,
	participantsBySlot: Map<string, string[]>,
	durationMinutes?: number
): CandidateWindow[] {
	if (slots.length === 0) return [];

	const sorted = [...slots].sort((a, b) => a.slot_start.localeCompare(b.slot_start));
	const slotMs = slotMinutes * 60 * 1000;
	const durMs = (durationMinutes ?? slotMinutes) * 60 * 1000;
	const durSlots = Math.ceil(durMs / slotMs);

	const windows: CandidateWindow[] = [];

	for (let i = 0; i <= sorted.length - durSlots; i++) {
		// check that all slots in this window are contiguous
		let contiguous = true;
		for (let j = i; j < i + durSlots - 1; j++) {
			const currEnd = new Date(sorted[j].slot_start).getTime() + slotMs;
			const nextStart = new Date(sorted[j + 1].slot_start).getTime();
			if (currEnd !== nextStart) {
				contiguous = false;
				break;
			}
		}
		if (!contiguous) continue;

		// intersect participants across all slots in the window
		let common: string[] | null = null;
		for (let j = i; j < i + durSlots; j++) {
			const slotParticipants = new Set(participantsBySlot.get(sorted[j].slot_start) ?? []);
			if (common === null) {
				common = [...slotParticipants];
			} else {
				common = common.filter((p) => slotParticipants.has(p));
			}
		}

		const participants = common ?? [];
		if (participants.length === 0) continue;

		const start = sorted[i].slot_start;
		const lastSlot = sorted[i + durSlots - 1].slot_start;
		const end = new Date(new Date(lastSlot).getTime() + slotMs).toISOString();

		windows.push({
			start,
			end,
			count: participants.length,
			participants
		});
	}

	// deduplicate: if two adjacent windows have the same participants, keep the earlier one
	const seen = new Set<string>();
	const deduped = windows.filter((w) => {
		const key = `${w.start}|${w.participants.sort().join(',')}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	// rank: count desc, then earliest start
	deduped.sort((a, b) => {
		if (b.count !== a.count) return b.count - a.count;
		return a.start.localeCompare(b.start);
	});

	return deduped;
}
