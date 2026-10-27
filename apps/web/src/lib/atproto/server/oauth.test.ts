import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtprotoAuthConfig } from '@svelte-atproto/oauth/server';
import { scopes, signUpPDS } from '../settings';
import { dev } from '$app/env';
import { oauthRequestLock } from './oauth';

const mocks = vi.hoisted(() => ({
	create: vi.fn((_config: AtprotoAuthConfig) => ({ api: {}, handlers: {}, handle: () => {} }))
}));
vi.mock('@svelte-atproto/oauth/server', () => ({ createAtprotoAuth: mocks.create }));
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

describe('OAuth library configuration', () => {
	it('preserves origin, signing credentials, signup, port, and declared metadata scopes', async () => {
		const { env } = await import('cloudflare:workers');
		Object.assign(env, {
			OAUTH_PUBLIC_URL: 'https://atmo.example',
			COOKIE_SECRET: 'secret',
			CLIENT_ASSERTION_KEY: 'private-key'
		});
		const { getAuth } = await import('./oauth');
		expect(getAuth()).toBe(getAuth());
		expect(mocks.create).toHaveBeenCalledOnce();
		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: 'https://atmo.example',
				cookieSecret: 'secret',
				clientAssertionKey: 'private-key',
				scope: scopes,
				signupPDS: signUpPDS[dev ? 'development' : 'production'],
				devPort: 5454,
				redirectPath: '/oauth/callback'
			})
		);
	});
	it('uses direct Worker bindings and retains state TTL and session keys', async () => {
		const sessions = { put: vi.fn(), get: vi.fn(), delete: vi.fn(), list: vi.fn() };
		const states = { ...sessions, put: vi.fn() };
		const { env } = await import('cloudflare:workers');
		Object.assign(env, { OAUTH_SESSIONS: sessions, OAUTH_STATES: states });
		const { getAuth } = await import('./oauth');
		getAuth();
		const config = mocks.create.mock.calls[0][0] as AtprotoAuthConfig;
		const sessionStore = (
			config.sessions as () => { set(key: string, value: unknown): Promise<void> }
		)();
		const stateStore = (
			config.states as () => { set(key: string, value: unknown): Promise<void> }
		)();
		await sessionStore.set('did:plc:alice', { token: 'test' });
		await stateStore.set('state', { requestedScope: ['atproto'] });
		expect(sessions.put).toHaveBeenCalledWith('did:plc:alice', '{"token":"test"}', {
			expirationTtl: undefined
		});
		expect(states.put).toHaveBeenCalledWith('state', '{"requestedScope":["atproto"]}', {
			expirationTtl: 600
		});
	});
	it('lets the library fall back to memory when local KV bindings are absent', async () => {
		const { getAuth } = await import('./oauth');
		getAuth();
		const config = mocks.create.mock.calls[0][0] as AtprotoAuthConfig;
		expect((config.sessions as () => unknown)()).toBeUndefined();
		expect((config.states as () => unknown)()).toBeUndefined();
	});
});

describe('shared OAuth refresh lock', () => {
	it('serializes interactive and background operations on the same session', async () => {
		const gate = Promise.withResolvers<void>();
		const order: string[] = [];
		const first = oauthRequestLock('same-session', async () => {
			order.push('first:start');
			await gate.promise;
			order.push('first:end');
		});
		const second = oauthRequestLock('same-session', async () => {
			order.push('second');
		});
		await Promise.resolve();
		expect(order).toEqual(['first:start']);
		gate.resolve();
		await Promise.all([first, second]);
		expect(order).toEqual(['first:start', 'first:end', 'second']);
	});
	it('does not leave a session locked after a failed operation', async () => {
		await expect(
			oauthRequestLock('failed-session', async () => {
				throw new Error('failure');
			})
		).rejects.toThrow('failure');
		expect(await oauthRequestLock('failed-session', async () => 'next')).toBe('next');
	});
	it('does not block unrelated sessions', async () => {
		const gate = Promise.withResolvers<void>();
		const first = oauthRequestLock('one-session', async () => gate.promise);
		expect(await oauthRequestLock('another-session', async () => 'ready')).toBe('ready');
		gate.resolve();
		await first;
	});
});
