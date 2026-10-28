import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const request = (viewer: string | null, parent: ReturnType<typeof vi.fn>) =>
	({ locals: { did: viewer }, parent }) as unknown as Parameters<typeof load>[0];

describe('viewer profile redirect', () => {
	it('redirects signed-out viewers to login without loading the profile', async () => {
		const parent = vi.fn();
		await expect(load(request(null, parent))).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(parent).not.toHaveBeenCalled();
	});
	it('reuses the root layout profile instead of querying Contrail again', async () => {
		const parent = vi.fn().mockResolvedValue({ profile: { did, handle: 'alice.test' } });
		await expect(load(request(did, parent))).rejects.toMatchObject({
			status: 303,
			location: '/p/alice.test'
		});
		expect(parent).toHaveBeenCalledOnce();
	});
	it('uses the signed-in DID when no profile was available', async () => {
		const parent = vi.fn().mockResolvedValue({ profile: null });
		await expect(load(request(did, parent))).rejects.toMatchObject({
			status: 303,
			location: `/p/${did}`
		});
	});
});
