import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the cron handler's collaborators so the test exercises only the handler's
// wiring: which functions it calls, and — the key regression — that it arms the
// Meili search sink by passing env to ensureInit. vi.hoisted keeps the spies
// available to the hoisted vi.mock factories below.
const { ensureInit, ingest, processBotMentions, runNotifications, runGeocodeDrip } = vi.hoisted(
	() => ({
		ensureInit: vi.fn(async (_db: unknown, _env?: unknown) => {}),
		ingest: vi.fn(async () => {}),
		processBotMentions: vi.fn(async () => {}),
		runNotifications: vi.fn(async () => {}),
		runGeocodeDrip: vi.fn(async () => {})
	})
);

vi.mock('$lib/contrail/index', () => ({
	ensureInit,
	contrail: { ingest }
}));
vi.mock('$lib/bot/process-mentions', () => ({ processBotMentions }));
vi.mock('$lib/notify/process', () => ({ runNotifications }));
vi.mock('$lib/geocode/process', () => ({ runGeocodeDrip }));

import { POST } from './+server';

const CRON_SECRET = 'cron-secret';
const DB = { __brand: 'D1' };

// Minimal RequestEvent shape the handler actually reads: request headers +
// platform.env (CRON_SECRET, DB, and the sink creds ensureInit reads).
function event(opts: { secret?: string | null } = {}) {
	const headers = new Headers();
	if (opts.secret != null) headers.set('X-Cron-Secret', opts.secret);
	const env = {
		CRON_SECRET,
		DB,
		SEARCH_SINK_URL: 'https://search.example',
		SEARCH_SINK_API_KEY: 'sink-key'
	};
	return {
		request: new Request('https://atmo.rsvp/api/cron', { method: 'POST', headers }),
		platform: { env }
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/cron', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects a request without the cron secret (no sink arming, no ingest)', async () => {
		const res = await POST(event({ secret: 'wrong' }));
		expect(res.status).toBe(401);
		expect(ensureInit).not.toHaveBeenCalled();
		expect(ingest).not.toHaveBeenCalled();
	});

	it('arms the Meili sink by passing env to ensureInit', async () => {
		const res = await POST(event({ secret: CRON_SECRET }));
		expect(res.status).toBe(200);

		// The regression fix: ensureInit must be called WITH the platform env, not
		// just the db, or searchSinkBackend never arms and cron ingest writes
		// nothing to Meili.
		expect(ensureInit).toHaveBeenCalledTimes(1);
		expect(ensureInit).toHaveBeenCalledWith(DB, expect.objectContaining({ CRON_SECRET, DB }));
		// Second arg (env) must be present — the whole bug was omitting it.
		expect(ensureInit.mock.calls[0].length).toBe(2);
		expect(ensureInit.mock.calls[0][1]).toBeDefined();
	});

	it('still runs ingest and the isolated bot/notify/drip stages on a valid tick', async () => {
		await POST(event({ secret: CRON_SECRET }));
		expect(processBotMentions).toHaveBeenCalledTimes(1);
		expect(ingest).toHaveBeenCalledTimes(1);
		expect(runNotifications).toHaveBeenCalledTimes(1);
		expect(runGeocodeDrip).toHaveBeenCalledTimes(1);
	});
});
