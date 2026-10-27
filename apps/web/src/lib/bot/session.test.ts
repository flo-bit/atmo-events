import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('@atcute/password-session', () => ({ PasswordSession: { login: mocks.login } }));
import { getBotHandle } from './session';
import { DEFAULT_BOT_PDS } from './config';

beforeEach(() => {
	vi.resetAllMocks();
});

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
		await bot?.flush();
		expect(kv.put).toHaveBeenLastCalledWith(
			'bot:session:bot.test',
			JSON.stringify(manager.session)
		);
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
