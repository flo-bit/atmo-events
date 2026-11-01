import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('#lib/actor.js', () => ({ actorToDid: mocks.resolve }));
import { GET } from './+server';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const get = (actor: string) =>
	GET({
		url: new URL(`https://atmo.rsvp/api/meet/resolve?actor=${encodeURIComponent(actor)}`)
	} as Parameters<typeof GET>[0]);
beforeEach(() => {
	mocks.resolve.mockReset().mockResolvedValue(bob);
});
describe('meeting actor lookup', () => {
	it('resolves a normalized handle without requiring a session', async () => {
		const response = await get('@Bob.Test');
		expect(await response.json()).toEqual({ did: bob });
		expect(mocks.resolve).toHaveBeenCalledWith('bob.test');
	});
	it('accepts a DID', async () => {
		expect(await (await get(bob)).json()).toEqual({ did: bob });
	});
	it.each(['', 'https://evil.test/account', 'not a handle'])(
		'rejects invalid input %s',
		async (actor) => {
			await expect(get(actor)).rejects.toMatchObject({ status: 400 });
			expect(mocks.resolve).not.toHaveBeenCalled();
		}
	);
	it('reports failed lookups instead of creating a placeholder DID', async () => {
		mocks.resolve.mockRejectedValue(new Error('DNS unavailable'));
		await expect(get('bob.test')).rejects.toMatchObject({ status: 404 });
	});
});
