import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Did } from '@atcute/lexicons';
import {
	getSchedulingRequest,
	getAllAvailability,
	getSlotCounts,
	getParticipantCount,
	getParticipantSlots,
	getVotes,
	getMyVote
} from '$lib/scheduling/db';
import { generateSlots } from '$lib/scheduling/timezones';
import { mergeIntoWindows } from '$lib/scheduling/overlap';
import { loadProfile } from '$lib/atproto/server/profile';
import type { PollOption } from '$lib/scheduling/types';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = platform!.env.DB;
	const request = await getSchedulingRequest(db, params.id);

	if (!request) {
		error(404, 'Scheduling request not found');
	}

	const isOrganizer = locals.did === request.organizer_did;
	const isLoggedIn = !!locals.did;

	// always generate grid slots (for collecting phase and heatmap display)
	const allSlots = generateSlots(
		request.date_start,
		request.date_end,
		request.time_start,
		request.time_end,
		request.organizer_tz,
		request.slot_minutes
	);

	// availability data
	const availability = await getAllAvailability(db, params.id);
	const slotCounts = await getSlotCounts(db, params.id);
	const participantCount = await getParticipantCount(db, params.id);

	// heatmap: slot_start -> count
	const heatmap: Record<string, number> = {};
	for (const sc of slotCounts) {
		heatmap[sc.slot_start] = sc.count;
	}

	// build per-participant slot sets (for hover highlight)
	const participantDids = [...new Set(availability.map((a) => a.participant_did))];
	const participantSlots: Record<string, string[]> = {};
	for (const did of participantDids) {
		participantSlots[did] = availability
			.filter((a) => a.participant_did === did)
			.map((a) => a.slot_start);
	}

	// load participant profiles
	const participants: Array<{
		did: string;
		handle: string;
		avatar?: string;
		displayName?: string;
	}> = [];
	for (const did of participantDids) {
		const profile = await loadProfile(did as Did, db);
		if (profile) {
			participants.push(profile as typeof participants[number]);
		} else {
			participants.push({ did, handle: did });
		}
	}

	// current user's selections
	let mySlots: string[] = [];
	if (locals.did) {
		mySlots = await getParticipantSlots(db, params.id, locals.did);
	}

	// for collecting phase: preview what the poll would look like
	let previewCandidates: Array<{ start: string; end: string; count: number }> = [];
	if (request.status === 'collecting' && participantCount > 0) {
		const participantsBySlot = new Map<string, string[]>();
		for (const row of availability) {
			const existing = participantsBySlot.get(row.slot_start) ?? [];
			existing.push(row.participant_did);
			participantsBySlot.set(row.slot_start, existing);
		}
		previewCandidates = mergeIntoWindows(
			slotCounts,
			request.slot_minutes,
			participantsBySlot,
			request.duration_minutes
		)
			.filter((c) => c.count >= 2)
			.slice(0, 5)
			.map((c) => ({ start: c.start, end: c.end, count: c.count }));
	}

	// poll data (for polling/resolved phases)
	let pollOptions: PollOption[] = [];
	let votes: Array<{ option_index: number; count: number; voters: string[] }> = [];
	let myVote: number | null = null;

	if (request.status === 'polling' || request.status === 'resolved') {
		try {
			pollOptions = JSON.parse(request.poll_options ?? '[]');
		} catch {
			pollOptions = [];
		}
		votes = await getVotes(db, params.id);
		if (locals.did) {
			myVote = await getMyVote(db, params.id, locals.did);
		}
	}

	return {
		request,
		allSlots,
		mySlots,
		heatmap,
		participantCount,
		participants,
		participantSlots,
		previewCandidates,
		pollOptions,
		votes,
		myVote,
		isOrganizer,
		isLoggedIn
	};
};
