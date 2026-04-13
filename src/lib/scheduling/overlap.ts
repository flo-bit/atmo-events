import type { CandidateWindow, SlotCount } from './types';

/**
 * Find overlapping availability windows and slice them into
 * duration-sized candidates.
 *
 * 1. Merge adjacent slots with the same participant count into contiguous blocks
 * 2. Slice each block into windows of `durationMinutes` length
 * 3. Rank by: participant count desc, earliest start
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

	// step 1: merge adjacent same-count slots into contiguous blocks
	interface Block {
		slots: string[];
		count: number;
	}

	const blocks: Block[] = [];
	let currentBlock: Block = { slots: [sorted[0].slot_start], count: sorted[0].count };

	for (let i = 1; i < sorted.length; i++) {
		const slot = sorted[i];
		const prevSlot = currentBlock.slots[currentBlock.slots.length - 1];
		const prevEnd = new Date(prevSlot).getTime() + slotMs;
		const currStart = new Date(slot.slot_start).getTime();

		if (currStart === prevEnd && slot.count === currentBlock.count) {
			currentBlock.slots.push(slot.slot_start);
		} else {
			blocks.push(currentBlock);
			currentBlock = { slots: [slot.slot_start], count: slot.count };
		}
	}
	blocks.push(currentBlock);

	// step 2: slice each block into duration-sized windows
	const windows: CandidateWindow[] = [];

	for (const block of blocks) {
		// slide a window of `durSlots` across the block
		for (let i = 0; i <= block.slots.length - durSlots; i++) {
			const start = block.slots[i];
			const lastSlot = block.slots[i + durSlots - 1];
			const end = new Date(new Date(lastSlot).getTime() + slotMs).toISOString();

			// collect participants across all slots in this window
			const participants = new Set<string>();
			for (let j = i; j < i + durSlots; j++) {
				for (const p of participantsBySlot.get(block.slots[j]) ?? []) {
					participants.add(p);
				}
			}

			windows.push({
				start,
				end,
				count: block.count,
				participants: [...participants]
			});
		}
	}

	// step 3: rank by count desc, then earliest start
	windows.sort((a, b) => {
		if (b.count !== a.count) return b.count - a.count;
		return a.start.localeCompare(b.start);
	});

	return windows;
}
