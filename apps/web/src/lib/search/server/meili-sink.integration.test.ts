// Live round-trip against a real Meilisearch (the write sink ↔ the read
// client) — the half the mocked unit test can't cover: real index settings,
// real upcoming/geo filters, real async indexing. Gated on MEILI_TEST_URL so
// normal `pnpm test` / CI skips it; run with a throwaway Meili:
//
//   docker run -d --rm -p 7700:7700 -e MEILI_MASTER_KEY=masterKey \
//     getmeili/meilisearch:v1.46
//   MEILI_TEST_URL=http://localhost:7700 MEILI_TEST_KEY=masterKey \
//     pnpm vitest run src/lib/search/server/meili-sink.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createMeiliSink, applyMeiliSettings, type MeiliSinkBackend } from './meili-sink';
import { searchEvents, nearMeEvents, type SearchBackend } from './meili';

const URL = process.env.MEILI_TEST_URL;
const KEY = process.env.MEILI_TEST_KEY ?? 'masterKey';
// A unique-ish index per run so reruns don't collide; the reader and writer
// share it.
const INDEX = process.env.MEILI_TEST_INDEX ?? 'events-spike';

const run = URL ? describe : describe.skip;

const EVENT = 'community.lexicon.calendar.event';
const FUTURE = '2099-01-01T10:00:00Z';

function created(uri: string, record: Record<string, unknown>) {
	return {
		kind: 'created' as const,
		uri,
		did: 'did:plc:alice',
		collection: EVENT,
		rkey: uri.split('/').pop()!,
		cid: 'bafycid',
		record,
		time_us: 1
	};
}

/** Meili indexes asynchronously (POST returns 202 + a task). Poll the read
 *  path until the predicate holds or we time out. */
async function eventually<T>(
	fn: () => Promise<T>,
	pred: (v: T) => boolean,
	{ tries = 40, delayMs = 250 } = {}
): Promise<T> {
	let last!: T;
	for (let i = 0; i < tries; i++) {
		last = await fn();
		if (pred(last)) return last;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	return last;
}

run('MeiliSink ↔ read client, live against real Meilisearch', () => {
	const backend: MeiliSinkBackend = { url: URL!, apiKey: KEY, indexUid: INDEX };
	const readBackend: SearchBackend = { url: URL!, apiKey: KEY, indexUid: INDEX };
	const sink = createMeiliSink(() => backend);
	const uri = 'at://did:plc:alice/community.lexicon.calendar.event/round-trip';

	beforeAll(async () => {
		await applyMeiliSettings(backend);
		// Start clean so a rerun doesn't see a stale doc from a prior run.
		await fetch(`${URL}/indexes/${INDEX}/documents`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${KEY}` }
		});
	});

	it('indexes a created event so the read path (text + near-me) finds it', async () => {
		await sink.onRecords(
			[
				created(uri, {
					name: 'Boulder Coffee Meetup',
					description: 'casual hang',
					startsAt: FUTURE,
					locations: [
						{ $type: 'community.lexicon.location.geo', latitude: '40.015', longitude: '-105.27' }
					]
				})
			],
			{ phase: 'live' }
		);

		// Text search through the real upcoming filter.
		const text = await eventually(
			() => searchEvents(readBackend, { q: 'coffee', limit: 10, offset: 0 }),
			(r) => r.hits.some((h) => h.uri === uri)
		);
		expect(text.hits.map((h) => h.uri)).toContain(uri);

		// Near-me through the real _geoRadius filter (within 5km of the point).
		const near = await nearMeEvents(readBackend, {
			lat: 40.015,
			lng: -105.27,
			radiusMeters: 5000,
			limit: 10,
			offset: 0
		});
		expect(near.hits.map((h) => h.uri)).toContain(uri);
		const hit = near.hits.find((h) => h.uri === uri);
		expect(hit?.distanceMeters).toBeGreaterThanOrEqual(0);
	});

	it('removes a deleted event so the read path no longer finds it', async () => {
		await sink.onRecords(
			[{ kind: 'deleted', uri, did: 'did:plc:alice', collection: EVENT, rkey: 'round-trip' }],
			{ phase: 'live' }
		);

		const text = await eventually(
			() => searchEvents(readBackend, { q: 'coffee', limit: 10, offset: 0 }),
			(r) => !r.hits.some((h) => h.uri === uri)
		);
		expect(text.hits.map((h) => h.uri)).not.toContain(uri);
	});
});

// The `contrail` CLI loads contrail.config.ts and fires `config.sinks` on the
// backfill path (phase:'backfill'). This proves the config the CLI actually loads
// carries a sink that lands a backfilled event in real Meili, reachable via the
// read path — the end-to-end half the mocked config unit test can't cover.
run('contrail.config sink populates Meili on backfill (CLI path)', () => {
	const readBackend: SearchBackend = { url: URL!, apiKey: KEY, indexUid: INDEX };
	const uri = 'at://did:plc:alice/community.lexicon.calendar.event/backfilled-via-config';
	const savedEnv: Record<string, string | undefined> = {};

	beforeAll(async () => {
		// Point the config-resolved sink at the test Meili, exactly as an operator
		// would export these before running `pnpm backfill:remote`.
		for (const k of ['SEARCH_SINK_URL', 'SEARCH_SINK_API_KEY', 'SEARCH_INDEX'] as const) {
			savedEnv[k] = process.env[k];
		}
		process.env.SEARCH_SINK_URL = URL;
		process.env.SEARCH_SINK_API_KEY = KEY;
		process.env.SEARCH_INDEX = INDEX;
		await applyMeiliSettings({ url: URL!, apiKey: KEY, indexUid: INDEX });
	});

	it('indexes a backfilled event through the config sink so the read path finds it', async () => {
		const { config } = await import('../../contrail.config');
		expect(config.sinks && config.sinks.length).toBeTruthy();

		await config.sinks![0].onRecords(
			[created(uri, { name: 'Backfilled Jazz Night', description: 'via cli backfill', startsAt: FUTURE })],
			{ phase: 'backfill' }
		);

		const text = await eventually(
			() => searchEvents(readBackend, { q: 'jazz', limit: 10, offset: 0 }),
			(r) => r.hits.some((h) => h.uri === uri)
		);
		expect(text.hits.map((h) => h.uri)).toContain(uri);

		for (const k of ['SEARCH_SINK_URL', 'SEARCH_SINK_API_KEY', 'SEARCH_INDEX'] as const) {
			if (savedEnv[k] === undefined) delete process.env[k];
			else process.env[k] = savedEnv[k];
		}
	});
});
