import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('@atcute/password-session', () => ({ PasswordSession: { login: mocks.login } }));
import { getBotHandle } from './session';
import { DEFAULT_BOT_PDS } from './config';

beforeEach(() => {
	vi.resetAllMocks();
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const session = {
	did: 'did:plc:bot',
	handle: 'bot.test',
	service: DEFAULT_BOT_PDS,
	accessJwt: 'access',
	refreshJwt: 'refresh',
	active: true
};
const environment = (kv: object) =>
	({
		BOT_IDENTIFIER: 'bot.test',
		BOT_APP_PASSWORD: 'password',
		OAUTH_SESSIONS: kv
	}) as unknown as Cloudflare.Env;
function setup(saved: unknown = session) {
	const kv = {
		get: vi.fn(async () => (saved ? JSON.stringify(saved) : null)),
		put: vi.fn(async () => {})
	};
	const manager = { did: session.did, session: { ...session }, handle: vi.fn() };
	mocks.login.mockResolvedValue(manager);
	return { kv, manager, env: environment(kv) };
}

describe('reply bot password-session migration', () => {
	it('does not attempt login when the bot is unconfigured', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await getBotHandle({} as Cloudflare.Env)).toBeNull();
		expect(mocks.login).not.toHaveBeenCalled();
		warn.mockRestore();
	});
	it('resumes legacy credentials under the same KV key, supplying the newly required service', async () => {
		const saved = {
			did: 'did:plc:bot',
			accessJwt: 'old',
			refreshJwt: 'refresh',
			handle: 'bot.test'
		};
		const kv = { get: vi.fn(async () => JSON.stringify(saved)), put: vi.fn() };
		const manager = {
			did: saved.did,
			session: { ...saved, service: DEFAULT_BOT_PDS },
			handle: vi.fn()
		};
		mocks.login.mockResolvedValue(manager);
		const bot = await getBotHandle({
			BOT_IDENTIFIER: 'bot.test',
			BOT_APP_PASSWORD: 'password',
			OAUTH_SESSIONS: kv
		} as unknown as Cloudflare.Env);
		expect(mocks.login).toHaveBeenCalledExactlyOnceWith(
			{ service: DEFAULT_BOT_PDS, identifier: 'bot.test', password: 'password' },
			{ session: { ...saved, service: DEFAULT_BOT_PDS } }
		);
		expect(kv.get).toHaveBeenCalledWith('bot:session:bot.test', 'text');
		expect(bot?.did).toBe(saved.did);
		manager.session.accessJwt = 'rotated';
		const flushed = bot?.flush();
		await vi.runAllTimersAsync();
		await flushed;
		expect(kv.put).toHaveBeenLastCalledWith(
			'bot:session:bot.test',
			JSON.stringify(manager.session)
		);
	});
	it('does not write KV on repeated/concurrent read-only opens or metadata changes', async () => {
		const { kv, manager, env } = setup();
		const bots = await Promise.all(Array.from({ length: 10 }, () => getBotHandle(env)));
		manager.session.handle = 'renamed.test';
		await Promise.all(bots.map((bot) => bot!.flush()));
		expect(kv.put).not.toHaveBeenCalled();
	});
	it('saves a fresh login only once, not again on an unchanged flush', async () => {
		const { kv, env } = setup(null);
		const bot = await getBotHandle(env);
		await bot!.flush();
		await bot!.flush();
		expect(kv.put).toHaveBeenCalledExactlyOnceWith('bot:session:bot.test', JSON.stringify(session));
	});
	it('deduplicates concurrent flushes and spaces changed credentials at least a second apart', async () => {
		const { kv, manager, env } = setup(null);
		const bot = (await getBotHandle(env))!;
		manager.session.accessJwt = 'rotated';
		const flushed = Promise.all([bot.flush(), bot.flush()]);
		await vi.advanceTimersByTimeAsync(999);
		expect(kv.put).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await flushed;
		expect(kv.put).toHaveBeenCalledTimes(2);
		expect(kv.put).toHaveBeenLastCalledWith(
			'bot:session:bot.test',
			JSON.stringify(manager.session)
		);
	});
	it('coordinates writes across handles sharing a KV key', async () => {
		const { kv, manager, env } = setup();
		const first = (await getBotHandle(env))!;
		const secondManager = { ...manager, session: { ...session } };
		mocks.login.mockResolvedValue(secondManager);
		const second = (await getBotHandle(env))!;
		manager.session.accessJwt = 'first';
		secondManager.session.accessJwt = 'second';
		const flushed = Promise.all([first.flush(), second.flush()]);
		await vi.advanceTimersByTimeAsync(999);
		expect(kv.put).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await flushed;
		expect(kv.put).toHaveBeenCalledTimes(2);
		expect(kv.put).toHaveBeenLastCalledWith(
			'bot:session:bot.test',
			JSON.stringify(secondManager.session)
		);
	});
	it('retries cross-isolate KV throttling without failing an otherwise successful open', async () => {
		const { kv, manager, env } = setup();
		const bot = (await getBotHandle(env))!;
		manager.session.refreshJwt = 'rotated';
		kv.put.mockRejectedValueOnce(new Error('KV PUT failed: 429 Too Many Requests'));
		const flushed = bot.flush();
		await vi.runAllTimersAsync();
		await flushed;
		expect(kv.put).toHaveBeenCalledTimes(2);
		await bot.flush();
		expect(kv.put).toHaveBeenCalledTimes(2);
	});
	it('bounds throttling retries and allows a failed save to be retried later', async () => {
		const { kv, manager, env } = setup();
		const bot = (await getBotHandle(env))!;
		manager.session.accessJwt = 'rotated';
		kv.put.mockRejectedValue(new Error('KV PUT failed: 429 Too Many Requests'));
		const failed = expect(bot.flush()).rejects.toThrow('429');
		await vi.runAllTimersAsync();
		await failed;
		expect(kv.put).toHaveBeenCalledTimes(4);
		kv.put.mockResolvedValue(undefined);
		await bot.flush();
		expect(kv.put).toHaveBeenCalledTimes(5);
	});
	it('does not swallow or retry unrelated persistence errors', async () => {
		const { kv, manager, env } = setup();
		const bot = (await getBotHandle(env))!;
		manager.session.accessJwt = 'rotated';
		kv.put.mockRejectedValueOnce(new Error('KV unavailable'));
		await expect(bot.flush()).rejects.toThrow('KV unavailable');
		expect(kv.put).toHaveBeenCalledTimes(1);
	});
	it('can log in afresh if the old KV value is malformed', async () => {
		const kv = { get: vi.fn(async () => 'not-json'), put: vi.fn() };
		mocks.login.mockResolvedValue({ did: 'did:plc:bot', session: {}, handle: vi.fn() });
		await getBotHandle({
			BOT_IDENTIFIER: 'bot.test',
			BOT_APP_PASSWORD: 'password',
			OAUTH_SESSIONS: kv
		} as unknown as Cloudflare.Env);
		expect(mocks.login).toHaveBeenCalledWith(expect.anything(), { session: undefined });
	});
});
