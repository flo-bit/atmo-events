import type { SchedulingRequest, SlotCount, PollVoteSummary } from './types';

let initialized = false;

export async function ensureSchedulingTables(db: D1Database): Promise<void> {
	if (initialized) return;
	await db.batch([
		db.prepare(`
			CREATE TABLE IF NOT EXISTS scheduling_requests (
				id TEXT PRIMARY KEY,
				organizer_did TEXT NOT NULL,
				title TEXT NOT NULL,
				date_start TEXT NOT NULL,
				date_end TEXT NOT NULL,
				time_start TEXT NOT NULL,
				time_end TEXT NOT NULL,
				organizer_tz TEXT NOT NULL,
				slot_minutes INTEGER NOT NULL DEFAULT 30,
				duration_minutes INTEGER NOT NULL DEFAULT 60,
				status TEXT NOT NULL DEFAULT 'collecting',
				poll_options TEXT,
				event_uri TEXT,
				created_at TEXT NOT NULL
			)
		`),
		db.prepare(`
			CREATE TABLE IF NOT EXISTS scheduling_availability (
				request_id TEXT NOT NULL,
				participant_did TEXT NOT NULL,
				slot_start TEXT NOT NULL,
				UNIQUE(request_id, participant_did, slot_start)
			)
		`),
		db.prepare(`
			CREATE TABLE IF NOT EXISTS scheduling_votes (
				request_id TEXT NOT NULL,
				voter_did TEXT NOT NULL,
				option_index INTEGER NOT NULL,
				UNIQUE(request_id, voter_did)
			)
		`)
	]);
	initialized = true;
}

export async function createSchedulingRequest(
	db: D1Database,
	req: Omit<SchedulingRequest, 'created_at' | 'status' | 'poll_options'>
): Promise<string> {
	await ensureSchedulingTables(db);
	await db
		.prepare(
			`INSERT INTO scheduling_requests (id, organizer_did, title, date_start, date_end, time_start, time_end, organizer_tz, slot_minutes, duration_minutes, status, poll_options, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'collecting', NULL, ?)`
		)
		.bind(
			req.id,
			req.organizer_did,
			req.title,
			req.date_start,
			req.date_end,
			req.time_start,
			req.time_end,
			req.organizer_tz,
			req.slot_minutes,
			req.duration_minutes,
			new Date().toISOString()
		)
		.run();
	return req.id;
}

export async function getSchedulingRequest(
	db: D1Database,
	id: string
): Promise<SchedulingRequest | null> {
	await ensureSchedulingTables(db);
	return db
		.prepare('SELECT * FROM scheduling_requests WHERE id = ?')
		.bind(id)
		.first<SchedulingRequest>();
}

export async function updateStatus(
	db: D1Database,
	id: string,
	status: string,
	opts?: { pollOptions?: string; eventUri?: string }
): Promise<void> {
	await ensureSchedulingTables(db);
	if (opts?.pollOptions !== undefined) {
		await db
			.prepare('UPDATE scheduling_requests SET status = ?, poll_options = ? WHERE id = ?')
			.bind(status, opts.pollOptions, id)
			.run();
	} else if (opts?.eventUri !== undefined) {
		await db
			.prepare('UPDATE scheduling_requests SET status = ?, event_uri = ? WHERE id = ?')
			.bind(status, opts.eventUri, id)
			.run();
	} else {
		await db
			.prepare('UPDATE scheduling_requests SET status = ? WHERE id = ?')
			.bind(status, id)
			.run();
	}
}

// --- availability ---

export async function upsertAvailability(
	db: D1Database,
	requestId: string,
	participantDid: string,
	slotStarts: string[]
): Promise<void> {
	await ensureSchedulingTables(db);
	await db
		.prepare('DELETE FROM scheduling_availability WHERE request_id = ? AND participant_did = ?')
		.bind(requestId, participantDid)
		.run();

	if (slotStarts.length === 0) return;

	const stmts = slotStarts.map((slot) =>
		db
			.prepare(
				'INSERT OR IGNORE INTO scheduling_availability (request_id, participant_did, slot_start) VALUES (?, ?, ?)'
			)
			.bind(requestId, participantDid, slot)
	);

	for (let i = 0; i < stmts.length; i += 100) {
		await db.batch(stmts.slice(i, i + 100));
	}
}

export async function getAllAvailability(
	db: D1Database,
	requestId: string
): Promise<Array<{ participant_did: string; slot_start: string }>> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare('SELECT participant_did, slot_start FROM scheduling_availability WHERE request_id = ?')
		.bind(requestId)
		.all<{ participant_did: string; slot_start: string }>();
	return result.results;
}

export async function getParticipantSlots(
	db: D1Database,
	requestId: string,
	participantDid: string
): Promise<string[]> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare(
			'SELECT slot_start FROM scheduling_availability WHERE request_id = ? AND participant_did = ?'
		)
		.bind(requestId, participantDid)
		.all<{ slot_start: string }>();
	return result.results.map((r) => r.slot_start);
}

export async function getSlotCounts(db: D1Database, requestId: string): Promise<SlotCount[]> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare(
			`SELECT slot_start, COUNT(DISTINCT participant_did) as count
			 FROM scheduling_availability WHERE request_id = ?
			 GROUP BY slot_start ORDER BY slot_start`
		)
		.bind(requestId)
		.all<SlotCount>();
	return result.results;
}

export async function getParticipantCount(db: D1Database, requestId: string): Promise<number> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare(
			'SELECT COUNT(DISTINCT participant_did) as count FROM scheduling_availability WHERE request_id = ?'
		)
		.bind(requestId)
		.first<{ count: number }>();
	return result?.count ?? 0;
}

// --- listing ---

export async function listMySchedulingRequests(
	db: D1Database,
	did: string
): Promise<SchedulingRequest[]> {
	await ensureSchedulingTables(db);
	// requests I created OR responded to
	const result = await db
		.prepare(
			`SELECT DISTINCT sr.* FROM scheduling_requests sr
			 LEFT JOIN scheduling_availability sa ON sr.id = sa.request_id AND sa.participant_did = ?
			 WHERE sr.organizer_did = ? OR sa.participant_did = ?
			 ORDER BY sr.created_at DESC`
		)
		.bind(did, did, did)
		.all<SchedulingRequest>();
	return result.results;
}

// --- delete ---

export async function deleteSchedulingRequest(db: D1Database, id: string): Promise<void> {
	await ensureSchedulingTables(db);
	await db.batch([
		db.prepare('DELETE FROM scheduling_votes WHERE request_id = ?').bind(id),
		db.prepare('DELETE FROM scheduling_availability WHERE request_id = ?').bind(id),
		db.prepare('DELETE FROM scheduling_requests WHERE id = ?').bind(id)
	]);
}

// --- poll votes ---

export async function castVote(
	db: D1Database,
	requestId: string,
	voterDid: string,
	optionIndex: number
): Promise<void> {
	await ensureSchedulingTables(db);
	await db
		.prepare(
			'INSERT INTO scheduling_votes (request_id, voter_did, option_index) VALUES (?, ?, ?) ON CONFLICT(request_id, voter_did) DO UPDATE SET option_index = ?'
		)
		.bind(requestId, voterDid, optionIndex, optionIndex)
		.run();
}

export async function getVotes(db: D1Database, requestId: string): Promise<PollVoteSummary[]> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare(
			'SELECT option_index, voter_did FROM scheduling_votes WHERE request_id = ? ORDER BY option_index'
		)
		.bind(requestId)
		.all<{ option_index: number; voter_did: string }>();

	const groups = new Map<number, string[]>();
	for (const row of result.results) {
		const existing = groups.get(row.option_index) ?? [];
		existing.push(row.voter_did);
		groups.set(row.option_index, existing);
	}

	return [...groups.entries()].map(([option_index, voters]) => ({
		option_index,
		count: voters.length,
		voters
	}));
}

export async function getMyVote(
	db: D1Database,
	requestId: string,
	voterDid: string
): Promise<number | null> {
	await ensureSchedulingTables(db);
	const result = await db
		.prepare('SELECT option_index FROM scheduling_votes WHERE request_id = ? AND voter_did = ?')
		.bind(requestId, voterDid)
		.first<{ option_index: number }>();
	return result?.option_index ?? null;
}
