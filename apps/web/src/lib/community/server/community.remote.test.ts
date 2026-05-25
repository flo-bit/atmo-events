import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetRequestEvent = vi.fn();

vi.mock('$app/server', () => ({
	command: (_schema: unknown, fn: Function) => {
		const wrapper = (...args: unknown[]) => fn(...args);
		Object.defineProperty(wrapper, '__', {
			value: { type: 'command', id: '', name: '' }
		});
		return wrapper;
	},
	query: (fn: Function) => {
		const wrapper = (...args: unknown[]) => fn(...args);
		Object.defineProperty(wrapper, '__', {
			value: { type: 'query', id: '', name: '' }
		});
		return wrapper;
	},
	getRequestEvent: () => mockGetRequestEvent()
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		COMMUNITY_AUTHORITIES:
			'http://localhost:3000|did:web:community.atmo.rsvp|rsvp.atmo'
	}
}));

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		const err = new Error(typeof message === 'string' ? message : String(message));
		(err as any).status = status;
		throw err;
	}
}));

const mockResolveSpaceHost = vi.fn();
vi.mock('./resolve-space-host', () => ({
	resolveSpaceHost: (...args: unknown[]) => mockResolveSpaceHost(...args)
}));

import { listPublishTargets, putCommunityRecord } from './community.remote';

describe('community.remote', () => {
	const mockOAuthClient = {
		get: vi.fn()
	};
	const mockFetch = vi.fn();
	const testDid = 'did:plc:testuser123';

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRequestEvent.mockReturnValue({
			locals: { client: mockOAuthClient, did: testDid },
			fetch: mockFetch
		});
	});

	describe('listPublishTargets', () => {
		it('returns empty when no authorities configured', async () => {
			const envMod = await import('$env/dynamic/private');
			(envMod.env as Record<string, string | undefined>).COMMUNITY_AUTHORITIES = '';

			const result = await listPublishTargets();
			expect(result).toEqual([]);

			(envMod.env as Record<string, string | undefined>).COMMUNITY_AUTHORITIES =
				'http://localhost:3000|did:web:community.atmo.rsvp|rsvp.atmo';
		});

		it('mints service-auth and fetches communities from each authority', async () => {
			mockOAuthClient.get.mockResolvedValue({
				ok: true,
				data: { token: 'test-jwt-token' }
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					communities: [
						{ did: 'did:plc:comm1', identifier: 'test-community', mode: 'open' }
					]
				})
			});

			const result = await listPublishTargets();

			expect(mockOAuthClient.get).toHaveBeenCalledWith(
				'com.atproto.server.getServiceAuth',
				expect.objectContaining({
					params: expect.objectContaining({
						aud: 'did:web:community.atmo.rsvp',
						lxm: 'rsvp.atmo.community.list'
					})
				})
			);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/xrpc/rsvp.atmo.community.list?actor='),
				expect.objectContaining({
					headers: { Authorization: 'Bearer test-jwt-token' }
				})
			);

			expect(result).toEqual([
				{ did: 'did:plc:comm1', identifier: 'test-community', mode: 'open' }
			]);
		});

		it('continues when an authority returns non-ok response', async () => {
			mockOAuthClient.get.mockResolvedValue({
				ok: true,
				data: { token: 'test-jwt-token' }
			});

			mockFetch.mockResolvedValue({
				ok: false,
				status: 500
			});

			const result = await listPublishTargets();
			expect(result).toEqual([]);
		});

		it('continues when an authority is unreachable', async () => {
			mockOAuthClient.get.mockRejectedValue(new Error('network error'));

			const result = await listPublishTargets();
			expect(result).toEqual([]);
		});

		it('throws 401 when not authenticated', async () => {
			mockGetRequestEvent.mockReturnValue({
				locals: { client: null, did: null },
				fetch: mockFetch
			});

			await expect(listPublishTargets()).rejects.toThrow('Not authenticated');
		});
	});

	describe('putCommunityRecord', () => {
		const input = {
			communityDid: 'did:plc:comm1',
			collection: 'rsvp.atmo.event',
			rkey: '3abc123',
			record: { title: 'Test Event' }
		};

		const mockAuthority = {
			endpoint: 'http://localhost:3000',
			serviceDid: 'did:web:community.atmo.rsvp',
			namespace: 'rsvp.atmo'
		};

		beforeEach(() => {
			mockResolveSpaceHost.mockResolvedValue(mockAuthority);
		});

		it('resolves authority, mints token, and posts record', async () => {
			mockOAuthClient.get.mockResolvedValue({
				ok: true,
				data: { token: 'put-jwt-token' }
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					uri: 'at://did:plc:comm1/rsvp.atmo.event/3abc123',
					cid: 'bafyreia...'
				})
			});

			const result = await putCommunityRecord(input);

			expect(mockResolveSpaceHost).toHaveBeenCalledWith(
				'did:plc:comm1',
				expect.any(Array)
			);

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/xrpc/rsvp.atmo.community.putRecord',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						Authorization: 'Bearer put-jwt-token',
						'Content-Type': 'application/json'
					}),
					body: JSON.stringify(input)
				})
			);

			expect(result).toEqual({
				uri: 'at://did:plc:comm1/rsvp.atmo.event/3abc123',
				cid: 'bafyreia...'
			});
		});

		it('throws 403 on authorization failure', async () => {
			mockOAuthClient.get.mockResolvedValue({
				ok: true,
				data: { token: 'put-jwt-token' }
			});

			mockFetch.mockResolvedValue({
				ok: false,
				status: 403,
				json: async () => ({ reason: 'Not a publisher' })
			});

			await expect(putCommunityRecord(input)).rejects.toThrow('Not a publisher');
		});

		it('throws 502 on upstream failure', async () => {
			mockOAuthClient.get.mockResolvedValue({
				ok: true,
				data: { token: 'put-jwt-token' }
			});

			mockFetch.mockResolvedValue({
				ok: false,
				status: 500,
				json: async () => ({ error: 'Internal' })
			});

			await expect(putCommunityRecord(input)).rejects.toThrow(
				'Community putRecord failed: 500'
			);
		});
	});
});
