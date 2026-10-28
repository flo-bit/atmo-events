import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';
import { getViewerProfileFromContrail } from '#lib/contrail.js';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const get = vi.fn();
const client = { get } as unknown as Client;
afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('viewer profile from Contrail', () => {
	it('uses the cached appview profile and avatar without a separate identity lookup', async () => {
		get.mockResolvedValue({
			ok: true,
			data: {
				profiles: [
					{
						did,
						handle: 'alice.test',
						value: { displayName: 'Alice', avatar: { ref: { $link: 'avatar-cid' } } }
					}
				]
			}
		});
		expect(await getViewerProfileFromContrail(client, did)).toEqual({
			did,
			handle: 'alice.test',
			displayName: 'Alice',
			avatar: `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/avatar-cid@webp`
		});
		expect(get).toHaveBeenCalledExactlyOnceWith('rsvp.atmo.getProfile', { params: { actor: did } });
	});
	it.each([undefined, '', 'handle.invalid'])(
		'falls back to the DID for an invalid handle: %s',
		async (handle) => {
			get.mockResolvedValue({ ok: true, data: { profiles: [{ did, handle }] } });
			expect(await getViewerProfileFromContrail(client, did)).toMatchObject({ did, handle: did });
		}
	);
	it('retains the signed-in DID when the appview has no profile', async () => {
		get.mockResolvedValue({ ok: true, data: { profiles: [] } });
		expect(await getViewerProfileFromContrail(client, did)).toEqual({ did, handle: did });
	});
	it('does not break authenticated loading when the appview is unavailable', async () => {
		get.mockRejectedValue(new Error('D1 unavailable'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await getViewerProfileFromContrail(client, did)).toBeUndefined();
		expect(log).toHaveBeenCalledWith('Failed to load profile:', expect.any(Error));
	});
});
