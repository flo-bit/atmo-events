import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pins the arming-failure ISOLATION property: when the search sink's
// settings/arming fetch fails (a stalling or erroring search endpoint), the cron
// tick must still return 200 AND ingest must still run. That property rests
// entirely on the try/catch inside the REAL ensureInit ($lib/contrail/index.ts).
//
// Unlike the sibling server.test.ts — which mocks $lib/contrail/index wholesale
// and therefore replaces ensureInit with a stub — this suite runs the REAL
// ensureInit so the try/catch is actually exercised. Delete that try/catch and
// this test goes red (ingest stops running once arming rejects). We replace only:
//   - applyMeiliSettings (in the search-sink module): forced to reject, standing
//     in for an unreachable/stalling search endpoint on the arming path;
//   - the Contrail engine (init/ingest): stubbed so no real D1 / firehose I/O
//     runs, and so we can assert ingest was still invoked after arming failed;
//   - the sibling cron stages (bot / notify / drip): no-op spies.
const { ingest, contrailInit, processBotMentions, runNotifications, runGeocodeDrip, applyMeiliSettings } =
	vi.hoisted(() => ({
		ingest: vi.fn(async () => {}),
		contrailInit: vi.fn(async () => {}),
		processBotMentions: vi.fn(async () => {}),
		runNotifications: vi.fn(async () => {}),
		runGeocodeDrip: vi.fn(async () => {}),
		applyMeiliSettings: vi.fn(async () => {
			throw new Error('search endpoint unreachable');
		})
	}));

// Stub the Contrail engine so the REAL $lib/contrail/index can load and its real
// ensureInit run without touching a live DB or jetstream. The real module builds
// `new Contrail(...)`, so this instance is what ensureInit.init and the handler's
// contrail.ingest resolve to.
vi.mock('@atmo-dev/contrail', async (importActual) => {
	const actual = await importActual<typeof import('@atmo-dev/contrail')>();
	return {
		...actual,
		Contrail: class {
			init = contrailInit;
			ingest = ingest;
		}
	};
});
vi.mock('@atmo-dev/contrail/server', () => ({ createHandler: () => () => new Response(null) }));

// The real ensureInit calls applyMeiliSettings from this module on the arming
// path; force that one call to reject. Everything else stays real (notably
// meiliSinkBackendFromEnv, which must return a backend from the env below).
vi.mock('$lib/search/server/meili-sink', async (importActual) => {
	const actual = await importActual<typeof import('$lib/search/server/meili-sink')>();
	return { ...actual, applyMeiliSettings };
});

vi.mock('$lib/bot/process-mentions', () => ({ processBotMentions }));
vi.mock('$lib/notify/process', () => ({ runNotifications }));
vi.mock('$lib/geocode/process', () => ({ runGeocodeDrip }));

import { POST } from './+server';

const CRON_SECRET = 'cron-secret';
const DB = { __brand: 'D1' };

function event(opts: { secret?: string | null } = {}) {
	const headers = new Headers();
	if (opts.secret != null) headers.set('X-Cron-Secret', opts.secret);
	const env = {
		CRON_SECRET,
		DB,
		// Present + complete so meiliSinkBackendFromEnv yields a backend and the real
		// ensureInit reaches applyMeiliSettings (which we force to reject).
		SEARCH_SINK_URL: 'https://search.example',
		SEARCH_SINK_API_KEY: 'sink-key'
	};
	return {
		request: new Request('https://atmo.rsvp/api/cron', { method: 'POST', headers }),
		platform: { env }
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/cron — arming-failure isolation (real ensureInit)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('still returns 200 and still runs ingest + notify/drip when sink arming rejects', async () => {
		const res = await POST(event({ secret: CRON_SECRET }));

		// Arming was actually attempted and failed (real ensureInit -> real
		// meiliSinkBackendFromEnv -> the rejecting applyMeiliSettings).
		expect(applyMeiliSettings).toHaveBeenCalledTimes(1);

		// The load-bearing invariant: a failing arm must be isolated inside
		// ensureInit's try/catch, so the tick 200s AND ingest still runs. Deleting
		// that try/catch makes ensureInit reject, which skips ingest — this
		// assertion is what catches that regression.
		expect(res.status).toBe(200);
		expect(ingest).toHaveBeenCalledTimes(1);
		expect(runNotifications).toHaveBeenCalledTimes(1);
		expect(runGeocodeDrip).toHaveBeenCalledTimes(1);
	});
});
