import { afterEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ dev: false }));
vi.mock('$app/environment', () => environment);
vi.mock('$lib/contrail/index', () => ({ ensureInit: vi.fn() }));
vi.mock('$lib/server/topic-counts', () => ({
	readTopicCounts: vi.fn(),
	refreshTopicCounts: vi.fn()
}));
import { ensureInit } from '$lib/contrail/index';
import { readTopicCounts, refreshTopicCounts } from '$lib/server/topic-counts';
import { load } from './+page.server';

const read = vi.mocked(readTopicCounts);
const db = {} as D1Database;
const event = (platform = { env: { DB: db } }) =>
	({ platform }) as unknown as Parameters<typeof load>[0];

afterEach(() => {
	environment.dev = false;
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('topic index counts', () => {
	it('loads the cached snapshot, preserving genuine zero counts', async () => {
		read.mockResolvedValue({ counts: { technology: 12, music: 0 }, updatedAt: 123 });
		expect(await load(event())).toEqual({
			pageTitle: 'Browse Topics',
			topicCounts: { technology: 12, music: 0 }
		});
		expect(read).toHaveBeenCalledExactlyOnceWith(db);
		expect(ensureInit).not.toHaveBeenCalled();
		expect(refreshTopicCounts).not.toHaveBeenCalled();
	});

	it('bootstraps the local schema and daily-gated snapshot in dev before reading', async () => {
		environment.dev = true;
		read.mockResolvedValue({ counts: { music: 3 }, updatedAt: 123 });
		expect(await load(event())).toEqual({ pageTitle: 'Browse Topics', topicCounts: { music: 3 } });
		expect(ensureInit).toHaveBeenCalledExactlyOnceWith(db);
		expect(refreshTopicCounts).toHaveBeenCalledExactlyOnceWith(db);
		expect(vi.mocked(ensureInit).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(refreshTopicCounts).mock.invocationCallOrder[0]
		);
		expect(vi.mocked(refreshTopicCounts).mock.invocationCallOrder[0]).toBeLessThan(
			read.mock.invocationCallOrder[0]
		);
	});

	it('keeps the last cached counts when the dev refresh fails', async () => {
		environment.dev = true;
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(refreshTopicCounts).mockRejectedValue(new Error('local D1 unavailable'));
		read.mockResolvedValue({ counts: { music: 3 }, updatedAt: 123 });
		expect(await load(event())).toEqual({ pageTitle: 'Browse Topics', topicCounts: { music: 3 } });
	});

	it('omits unknown counts before the first refresh', async () => {
		read.mockResolvedValue(null);
		expect(await load(event())).toEqual({ pageTitle: 'Browse Topics', topicCounts: null });
	});

	it('still renders topics when the cache table is missing or D1 is unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		read.mockRejectedValue(new Error('no such table: topic_counts_cache'));
		expect(await load(event())).toEqual({ pageTitle: 'Browse Topics', topicCounts: null });
	});
});
