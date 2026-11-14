import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtprotoAuthConfig } from '@svelte-atproto/oauth/server';
import { scopes } from '#lib/atproto/settings.js';
import { BETA_SCOPE } from './beta';
import { PRIVATE_EVENT_SCOPES } from './scopes';

const mocks = vi.hoisted(() => ({
	create: vi.fn<(config: AtprotoAuthConfig) => unknown>(() => ({ api: {}, handlers: {} }))
}));
vi.mock('@svelte-atproto/oauth/server', () => ({ createAtprotoAuth: mocks.create }));

async function declared(privateEvents: string | undefined) {
	const { env } = await import('cloudflare:workers');
	Object.assign(env, {
		OAUTH_PUBLIC_URL: 'https://atmo.example',
		COOKIE_SECRET: 'secret',
		CLIENT_ASSERTION_KEY: 'private-key',
		PRIVATE_EVENTS: privateEvents
	});
	const { getAuth } = await import('#lib/atproto/server/oauth.js');
	getAuth();
	return (mocks.create.mock.calls[0][0] as AtprotoAuthConfig).scope;
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});
afterEach(async () => {
	const { env } = await import('cloudflare:workers');
	delete (env as { PRIVATE_EVENTS?: string }).PRIVATE_EVENTS;
});

describe('the sign-in permissions a deployment declares', () => {
	it('adds the private event permissions and the beta switch when private events are on', async () => {
		expect(await declared('true')).toEqual([...scopes, ...PRIVATE_EVENT_SCOPES, BETA_SCOPE]);
	});
	it('adds neither when they are off', async () => {
		expect(await declared(undefined)).toEqual(scopes);
	});
});
