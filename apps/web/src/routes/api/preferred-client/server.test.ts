import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('#lib/atproto/preferred-client.server.js', () => ({
	getPreferredClientRecord: mocks.read
}));
import { GET } from './+server';

const client = {};
const request = (did: string | null = 'did:plc:alice') =>
	({ locals: { did, client: did ? client : null } }) as Parameters<typeof GET>[0];

beforeEach(() => {
	mocks.read.mockReset().mockResolvedValue(null);
});

describe('preferred-client browser-cache endpoint', () => {
	it('requires a session, and never publicly caches even errors', async () => {
		const response = await GET(request(null));
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.read).not.toHaveBeenCalled();
	});
	it('returns only the current viewer’s parsed public preference', async () => {
		mocks.read.mockResolvedValue({
			record: { client: 'mu', extension: 'not returned' },
			cid: 'cid'
		});
		const response = await GET(request());
		expect(await response.json()).toEqual({ did: 'did:plc:alice', value: { client: 'mu' } });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
			client,
			'did:plc:alice',
			expect.any(AbortSignal)
		);
	});
	it('returns explicit absence, which can be cached', async () => {
		expect(await (await GET(request())).json()).toEqual({ did: 'did:plc:alice', value: null });
	});
	it('distinguishes failed reads from absence', async () => {
		mocks.read.mockRejectedValue(new Error('timeout'));
		const response = await GET(request());
		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.json()).not.toHaveProperty('value');
	});
});
