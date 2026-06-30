import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from './contrail.config';

// The pipelineQuery handlers are pure (db unused for these), so they can be
// exercised directly: handler(db, params, config) -> { conditions, params }.
const listDiscoverableByUris = config.collections!.event.pipelineQueries!.listDiscoverableByUris;

const run = async (search: string) => {
	const source = await listDiscoverableByUris(
		undefined as never,
		new URLSearchParams(search),
		config
	);
	return { conditions: source.conditions ?? [], params: source.params };
};

describe('listDiscoverableByUris pipelineQuery', () => {
	it('binds the given uris as SQL params (never interpolated) and keeps the discoverability filter', async () => {
		const uriA = 'at://did:plc:one/community.lexicon.calendar.event/aaa';
		const uriB = 'at://did:plc:two/community.lexicon.calendar.event/bbb';

		const source = await run(`uris=${encodeURIComponent(`${uriA},${uriB}`)}`);

		// Injection safety: uris travel as bound params, one placeholder each.
		expect(source.params).toEqual([uriA, uriB]);
		const placeholders = source.conditions.join(' ').match(/\?/g) ?? [];
		expect(placeholders).toHaveLength(2);
		// The search surface must not leak events hidden from discovery.
		expect(source.conditions.some((c: string) => c.includes('preferences.showInDiscovery'))).toBe(
			true
		);
	});

	it('matches nothing when no uris are given', async () => {
		const source = await run('');

		expect(source.conditions).toContain('0 = 1');
		expect(source.params ?? []).toEqual([]);
	});

	it('caps the uri list at the search overfetch budget (only legitimate caller volume)', async () => {
		const uris = Array.from({ length: 150 }, (_, i) => `at://did:plc:x/c/e${i}`).join(',');

		const source = await run(`uris=${encodeURIComponent(uris)}`);

		// 60 = SEARCH_PAGE_SIZE(20) × SEARCH_OVERFETCH(3); +1 pipeline LIMIT bind
		// stays far under D1's 100-bound-param query limit.
		expect(source.params).toHaveLength(60);
	});
});

// The `contrail` CLI (`pnpm backfill` / `contrail refresh`) loads THIS config and
// builds `new Contrail(config)`, then fires `config.sinks` from applyEvents with
// phase:'backfill' (contrail-appview). The runtime Worker attaches its own sink in
// $lib/contrail/index.ts, so search stays current for live ingest — but the CLI
// only populates Meili if the config it loads carries the sink. Wire it here,
// gated on SEARCH_SINK_URL so it's active for an operator-run backfill and absent
// for `pnpm generate` / the Worker (which overrides sinks anyway).
describe('Meili search sink wiring (CLI backfill/refresh)', () => {
	const ENV_KEYS = ['SEARCH_SINK_URL', 'SEARCH_SINK_API_KEY', 'SEARCH_INDEX'] as const;
	const saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const k of ENV_KEYS) {
			saved[k] = process.env[k];
			delete process.env[k];
		}
		vi.resetModules();
	});

	afterEach(() => {
		for (const k of ENV_KEYS) {
			if (saved[k] === undefined) delete process.env[k];
			else process.env[k] = saved[k];
		}
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('carries a Meili sink that upserts a backfilled event when SEARCH_SINK_URL is configured', async () => {
		process.env.SEARCH_SINK_URL = 'http://meili.local';
		process.env.SEARCH_SINK_API_KEY = 'admin-key';
		process.env.SEARCH_INDEX = 'events-test';

		const calls: { url: string; method: string }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				calls.push({ url: String(input), method: init?.method ?? 'GET' });
				return new Response(null, { status: 202 });
			})
		);

		const { config: loaded } = await import('./contrail.config');
		expect(loaded.sinks && loaded.sinks.length).toBeTruthy();

		await loaded.sinks![0].onRecords(
			[
				{
					kind: 'created',
					uri: 'at://did:plc:alice/community.lexicon.calendar.event/backfilled',
					did: 'did:plc:alice',
					collection: 'community.lexicon.calendar.event',
					rkey: 'backfilled',
					cid: 'bafycid',
					record: { name: 'Backfilled Jazz Night', startsAt: '2099-01-01T10:00:00Z' },
					time_us: 1
				}
			],
			{ phase: 'backfill' }
		);

		const put = calls.find((c) => c.method === 'PUT');
		expect(put).toBeDefined();
		expect(put!.url).toBe('http://meili.local/indexes/events-test/documents?primaryKey=id');
	});

	it('omits sinks when SEARCH_SINK_URL is unset (generate / Worker stay sink-free here)', async () => {
		const { config: loaded } = await import('./contrail.config');
		expect(loaded.sinks ?? []).toHaveLength(0);
	});
});
