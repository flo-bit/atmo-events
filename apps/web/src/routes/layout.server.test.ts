import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	can: vi.fn(),
	profile: vi.fn(),
	get: vi.fn(),
	preferredClient: vi.fn()
}));
vi.mock('#lib/atproto/preferred-client.server.js', () => ({
	getPreferredClientRecord: mocks.preferredClient
}));
vi.mock('#lib/atproto/server/oauth.js', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
vi.mock('#lib/contrail.js', () => ({ getViewerProfileFromContrail: mocks.profile }));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({ get: mocks.get }) }));
import { load } from './+layout.server';

const request = (did: string | null) =>
	({ locals: { did, client: did ? {} : null } }) as Parameters<typeof load>[0];
beforeEach(() => {
	vi.resetAllMocks();
	mocks.profile.mockResolvedValue(null);
	mocks.preferredClient.mockResolvedValue(null);
});

describe('viewer permission state', () => {
	it('loads the signed-in viewer’s public social-client selection', async () => {
		mocks.preferredClient.mockResolvedValue({ record: { client: 'mu' }, cid: 'cid' });
		expect(await load(request('did:plc:alice'))).toMatchObject({
			preferredSocialClient: { client: 'mu' },
			preferredClientLoadFailed: false
		});
	});
	it('keeps the viewer signed in when their PDS is unavailable', async () => {
		mocks.preferredClient.mockRejectedValue(new Error('offline'));
		expect(await load(request('did:plc:alice'))).toMatchObject({
			did: 'did:plc:alice',
			preferredSocialClient: null,
			preferredClientLoadFailed: true
		});
	});
	it('never grants posting to a signed-out viewer', async () => {
		expect(await load(request(null))).toEqual({
			did: null,
			profile: null,
			preferredSocialClient: null,
			preferredClientLoadFailed: false,
			canPostToBluesky: false,
			isModerator: false
		});
		expect(mocks.can).not.toHaveBeenCalled();
		expect(mocks.preferredClient).not.toHaveBeenCalled();
	});
	it.each([false, true])('forwards the actual token capability: %s', async (granted) => {
		mocks.can.mockResolvedValue(granted);
		expect(await load(request('did:plc:alice'))).toMatchObject({ canPostToBluesky: granted });
		expect(mocks.can).toHaveBeenCalledExactlyOnceWith({
			type: 'repo',
			collection: 'app.bsky.feed.post',
			action: 'create'
		});
		expect(mocks.get).toHaveBeenCalledWith(
			'rsvp.atmo.getFeed',
			expect.objectContaining({ params: expect.objectContaining({ actor: 'did:plc:alice' }) })
		);
	});
	it('fails closed without discarding the authenticated viewer after a transient check failure', async () => {
		mocks.can.mockRejectedValue(new Error('temporary failure'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await load(request('did:plc:alice'))).toMatchObject({
			did: 'did:plc:alice',
			canPostToBluesky: false
		});
		warn.mockRestore();
	});
});
