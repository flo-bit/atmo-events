import { describe, it, expect } from 'vitest';
import { config } from './contrail.config';

// The pipelineQuery handlers are pure (db unused for these), so they can be
// exercised directly: handler(db, params, config) -> { conditions, params }.
const listDiscoverableByUris = config.collections!.event.pipelineQueries!.listDiscoverableByUris;

const run = async (search: string) => {
	const source = await listDiscoverableByUris(undefined as never, new URLSearchParams(search), config);
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
		expect(
			source.conditions.some((c: string) => c.includes('preferences.showInDiscovery'))
		).toBe(true);
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
