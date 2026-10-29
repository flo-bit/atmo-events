import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	ingest: vi.fn(async () => {}),
	retryBackfill: vi.fn(async () => {}),
	processBotMentions: vi.fn(async () => {}),
	refreshTopicCounts: vi.fn(async () => {})
}));
vi.mock('#lib/contrail/index.js', () => ({ ensureInit: vi.fn(async () => mocks) }));
vi.mock('#lib/bot/process-mentions.js', () => ({ processBotMentions: mocks.processBotMentions }));
vi.mock('#lib/server/topic-counts.js', () => ({ refreshTopicCounts: mocks.refreshTopicCounts }));
import { env } from 'cloudflare:workers';
import { POST } from './+server';
const DB = {};
function event(secret = 'secret') {
	Object.assign(env, { DB, CRON_SECRET: 'secret' });
	return {
		request: new Request('https://atmo.rsvp/api/cron', {
			method: 'POST',
			headers: { 'X-Cron-Secret': secret }
		})
	} as Parameters<typeof POST>[0];
}
afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});
describe('scheduled ingestion', () => {
	it('rejects unauthenticated ticks without doing work', async () => {
		expect((await POST(event('bad'))).status).toBe(401);
		expect(mocks.ingest).not.toHaveBeenCalled();
	});
	it('uses bounded ingestion and due backfill retries, without external search work', async () => {
		expect((await POST(event())).status).toBe(200);
		expect(mocks.ingest).toHaveBeenCalledWith({ maxDrainMs: 20_000, maxCandidates: 250 }, DB);
		expect(mocks.retryBackfill).toHaveBeenCalledWith({ maxAccounts: 5 }, DB);
		expect(mocks.processBotMentions).toHaveBeenCalledTimes(1);
		expect(mocks.refreshTopicCounts).toHaveBeenCalledTimes(1);
	});
	it('isolates ingestion failure from other jobs', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.ingest.mockRejectedValueOnce(new Error('DB unavailable'));
		expect((await POST(event())).status).toBe(200);
		expect(mocks.retryBackfill).toHaveBeenCalledTimes(1);
		expect(mocks.refreshTopicCounts).toHaveBeenCalledTimes(1);
	});
});
