import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	login: vi.fn(async () => {}),
	signup: vi.fn(async () => {}),
	logout: vi.fn(async () => {}),
	page: { data: {} as Record<string, unknown> }
}));
vi.mock('@svelte-atproto/oauth/client', () => mocks);
vi.mock('$app/state', () => ({ page: mocks.page }));
import { login, signup, logout, user } from './auth.svelte';
import { blueskyPostingScope, getLoginScopes, requiredScopes } from './settings';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.page.data = {};
});

describe('OAuth client integration', () => {
	it('passes the required-only selection and return-path handling to the library', async () => {
		await login(' @alice ');
		expect(mocks.login).toHaveBeenCalledExactlyOnceWith('alice.bsky.social', {
			scope: requiredScopes,
			saveReturnTo: true
		});
	});
	it('passes an explicit optional selection without changing a DID', async () => {
		await login('did:plc:alice', { scopes: [blueskyPostingScope] });
		expect(mocks.login).toHaveBeenCalledExactlyOnceWith('did:plc:alice', {
			scope: [...requiredScopes, blueskyPostingScope],
			saveReturnTo: true
		});
	});
	it('requests ordinary signup scopes without the optional moderator grant', async () => {
		await signup();
		expect(mocks.signup).toHaveBeenCalledExactlyOnceWith({
			scope: getLoginScopes([blueskyPostingScope]),
			saveReturnTo: true
		});
	});
	it('does not infer posting permission from login', () => {
		mocks.page.data = { did: 'did:plc:alice' };
		expect(user.isLoggedIn).toBe(true);
		expect(user.canPostToBluesky).toBe(false);
		mocks.page.data.canPostToBluesky = true;
		expect(user.canPostToBluesky).toBe(true);
	});
	it('delegates revocation and cookie cleanup to the library', async () => {
		await logout();
		expect(mocks.logout).toHaveBeenCalledExactlyOnceWith();
	});
});
