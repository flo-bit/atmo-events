import { describe, expect, it, vi } from 'vitest';
import type { StoredSession, Store } from '@atcute/oauth-node-client';
import type { Did } from '@atcute/lexicons';
import type { SessionWithHistory } from '@svelte-atproto/oauth/server';
import { backgroundSessions } from './oauth';

const did = 'did:plc:alice' as Did;
function store(previous: SessionWithHistory | undefined) {
	return {
		get: vi.fn(async () => previous),
		set: vi.fn(),
		delete: vi.fn(),
		clear: vi.fn()
	} satisfies Store<Did, StoredSession>;
}

describe('reply bot OAuth compatibility', () => {
	it('retains requested scopes and login generation when rotating tokens', async () => {
		const history = {
			version: 1 as const,
			requestedScope: ['atproto', 'include:community.lexicon.calendar.authFull']
		};
		const backing = store({
			svelteAtproto: history,
			svelteAtprotoSessionId: 'generation'
		} as SessionWithHistory);
		const refreshed = { tokenSet: { access_token: 'new-token' } } as unknown as StoredSession;
		await backgroundSessions(backing).set(did, refreshed);
		expect(backing.set).toHaveBeenCalledExactlyOnceWith(did, {
			...refreshed,
			svelteAtproto: history,
			svelteAtprotoSessionId: 'generation'
		});
	});
	it('does not invent scope history for an old session', async () => {
		const backing = store(undefined);
		const refreshed = {} as StoredSession;
		await backgroundSessions(backing).set(did, refreshed);
		expect(backing.set).toHaveBeenCalledExactlyOnceWith(did, refreshed);
	});
	it('still saves a rotated token if the advisory-history read fails', async () => {
		const backing = store(undefined);
		backing.get.mockRejectedValue(new Error('KV read unavailable'));
		const refreshed = {} as StoredSession;
		await backgroundSessions(backing).set(did, refreshed);
		expect(backing.set).toHaveBeenCalledExactlyOnceWith(did, refreshed);
	});
});
