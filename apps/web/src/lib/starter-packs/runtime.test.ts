import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	getBotHandle: vi.fn(),
	waitForPackIndex: vi.fn(),
	flush: vi.fn(),
	getOrCreate: vi.fn(),
	mappings: vi.fn(),
	reconcile: vi.fn(),
	defer: vi.fn()
}));
vi.mock('#lib/bot/session.js', () => ({ getBotHandle: mocks.getBotHandle }));
vi.mock('./indexed', () => ({ waitForPackIndex: mocks.waitForPackIndex }));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('./service', () => ({
	StarterPackService: class {
		getOrCreate = mocks.getOrCreate;
		mappings = mocks.mappings;
		reconcile = mocks.reconcile;
		defer = mocks.defer;
	}
}));
import { getEventStarterPack, syncEventStarterPacks } from './runtime';
const DB = {} as D1Database;
const env = { BOT_IDENTIFIER: 'bot.test', BOT_APP_PASSWORD: 'secret', DB } as Cloudflare.Env;
beforeEach(() => {
	vi.resetAllMocks();
	mocks.getBotHandle.mockResolvedValue({ client: {}, did: 'did:plc:bot', flush: mocks.flush });
	mocks.mappings.mockResolvedValue([]);
});
describe('starter-pack background work', () => {
	it('returns existing/created URLs and always flushes rotated credentials', async () => {
		mocks.getOrCreate.mockResolvedValue('https://bsky.app/starter-pack/bot/pack');
		expect(await getEventStarterPack(env, 'event')).toBe('https://bsky.app/starter-pack/bot/pack');
		expect(mocks.flush).toHaveBeenCalledTimes(1);
		expect(mocks.waitForPackIndex).toHaveBeenCalledWith(
			{},
			'https://bsky.app/starter-pack/bot/pack'
		);
		mocks.getOrCreate.mockRejectedValue(new Error('write failed'));
		await expect(getEventStarterPack(env, 'event')).rejects.toThrow('write failed');
		expect(mocks.flush).toHaveBeenCalledTimes(2);
	});
	it('does not authenticate when the bot is unconfigured', async () => {
		await syncEventStarterPacks({} as Cloudflare.Env, DB);
		expect(mocks.getBotHandle).not.toHaveBeenCalled();
	});
	it('uses the atproto worklist, skips recently attempted packs, and bounds each tick', async () => {
		mocks.mappings.mockResolvedValue([
			{ event: 'recent', lastAttemptAt: new Date().toISOString() },
			...Array.from({ length: 8 }, (_, n) => ({
				event: `event${n}`,
				lastAttemptAt: new Date(n * 1000).toISOString()
			}))
		]);
		await syncEventStarterPacks(env, DB);
		expect(mocks.reconcile.mock.calls.map(([uri]) => uri)).toEqual([
			'event0',
			'event1',
			'event2',
			'event3',
			'event4'
		]);
		expect(mocks.flush).toHaveBeenCalledTimes(1);
	});
	it('shares one run budget across packs, saves backoff and stops before starting later packs', async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			mocks.mappings.mockResolvedValue([{ event: 'first' }, { event: 'slow' }, { event: 'later' }]);
			mocks.reconcile
				.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 20_000)))
				.mockImplementationOnce(
					(_uri, signal: AbortSignal) =>
						new Promise((_resolve, reject) => {
							signal.addEventListener('abort', () => reject(signal.reason), { once: true });
						})
				);
			const failed = expect(syncEventStarterPacks(env, DB)).rejects.toThrow('time budget');
			await vi.advanceTimersByTimeAsync(30_000);
			await failed;
			expect(mocks.reconcile.mock.calls.map(([uri]) => uri)).toEqual(['first', 'slow']);
			expect(mocks.reconcile.mock.calls[0][1]).toBe(mocks.reconcile.mock.calls[1][1]);
			expect(mocks.defer).toHaveBeenCalledExactlyOnceWith('slow');
			expect(mocks.flush).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
			log.mockRestore();
		}
	});
	it('isolates per-event failures and persists backoff rather than starving the next pack', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.mappings.mockResolvedValue([{ event: 'broken' }, { event: 'healthy' }]);
		mocks.reconcile.mockRejectedValueOnce(new Error('RSVP fetch failed'));
		await syncEventStarterPacks(env, DB);
		expect(mocks.defer).toHaveBeenCalledExactlyOnceWith('broken');
		expect(mocks.reconcile).toHaveBeenCalledWith('healthy', expect.any(AbortSignal));
		expect(mocks.flush).toHaveBeenCalledTimes(1);
		log.mockRestore();
	});
});
