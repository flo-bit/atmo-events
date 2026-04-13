import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createSchedulingRequest,
	getSchedulingRequest,
	upsertAvailability,
	updateStatus,
	getSlotCounts,
	getAllAvailability,
	castVote,
	deleteSchedulingRequest
} from '$lib/scheduling/db';
import { mergeIntoWindows } from '$lib/scheduling/overlap';
import type { PollOption } from '$lib/scheduling/types';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const db = platform!.env.DB;

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const action = body.action;

	if (action === 'create') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { title, date_start, date_end, time_start, time_end, organizer_tz } = body;

		if (!title || !date_start || !date_end || !time_start || !time_end || !organizer_tz) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const id = crypto.randomUUID().slice(0, 8);
		await createSchedulingRequest(db, {
			id,
			organizer_did: locals.did,
			title,
			date_start,
			date_end,
			time_start,
			time_end,
			organizer_tz,
			slot_minutes: 30,
			duration_minutes: body.duration_minutes ?? 60
		});

		return json({ id });
	}

	if (action === 'respond') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { request_id, slots } = body;
		if (!request_id || !Array.isArray(slots)) {
			return json({ error: 'Missing request_id or slots' }, { status: 400 });
		}

		const req = await getSchedulingRequest(db, request_id);
		if (!req) return json({ error: 'Not found' }, { status: 404 });
		if (req.status !== 'collecting') {
			return json({ error: 'Availability collection is closed' }, { status: 400 });
		}

		await upsertAvailability(db, request_id, locals.did, slots);
		return json({ ok: true });
	}

	if (action === 'generate_poll') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { request_id } = body;
		const req = await getSchedulingRequest(db, request_id);
		if (!req) return json({ error: 'Not found' }, { status: 404 });
		if (req.status !== 'collecting') {
			return json({ error: 'Poll already generated' }, { status: 400 });
		}
		if (req.organizer_did !== locals.did) {
			return json({ error: 'Only the organizer can lock availability' }, { status: 403 });
		}

		// compute overlapping windows
		const slotCounts = await getSlotCounts(db, request_id);
		const availability = await getAllAvailability(db, request_id);

		const participantsBySlot = new Map<string, string[]>();
		for (const row of availability) {
			const existing = participantsBySlot.get(row.slot_start) ?? [];
			existing.push(row.participant_did);
			participantsBySlot.set(row.slot_start, existing);
		}

		const candidates = mergeIntoWindows(
			slotCounts,
			req.slot_minutes,
			participantsBySlot,
			req.duration_minutes
		).filter((c) => c.count >= 2);

		if (candidates.length === 0) {
			return json({ error: 'No overlapping times found — need more responses' }, { status: 400 });
		}

		// take top candidates as poll options (max 5)
		const pollOptions: PollOption[] = candidates.slice(0, 5).map((c) => ({
			start: c.start,
			end: c.end
		}));

		await updateStatus(db, request_id, 'polling', { pollOptions: JSON.stringify(pollOptions) });
		return json({ ok: true, options: pollOptions });
	}

	if (action === 'vote') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { request_id, option_index } = body;
		const req = await getSchedulingRequest(db, request_id);
		if (!req) return json({ error: 'Not found' }, { status: 404 });
		if (req.status !== 'polling') {
			return json({ error: 'Voting is not open' }, { status: 400 });
		}

		let options: PollOption[];
		try {
			options = JSON.parse(req.poll_options ?? '[]');
		} catch {
			return json({ error: 'Corrupted poll data' }, { status: 500 });
		}
		// option_index can be -1 for "none of these work"
		if (option_index < -1 || option_index >= options.length) {
			return json({ error: 'Invalid option' }, { status: 400 });
		}

		await castVote(db, request_id, locals.did, option_index);
		return json({ ok: true });
	}

	if (action === 'resolve') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { request_id, event_uri } = body;
		const req = await getSchedulingRequest(db, request_id);
		if (!req) return json({ error: 'Not found' }, { status: 404 });
		if (req.organizer_did !== locals.did) {
			return json({ error: 'Only the organizer can resolve' }, { status: 403 });
		}

		await updateStatus(db, request_id, 'resolved', { eventUri: event_uri });
		return json({ ok: true });
	}

	if (action === 'delete') {
		if (!locals.did) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const { request_id } = body;
		const req = await getSchedulingRequest(db, request_id);
		if (!req) return json({ error: 'Not found' }, { status: 404 });
		if (req.organizer_did !== locals.did) {
			return json({ error: 'Only the organizer can delete' }, { status: 403 });
		}

		await deleteSchedulingRequest(db, request_id);
		return json({ ok: true });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};
