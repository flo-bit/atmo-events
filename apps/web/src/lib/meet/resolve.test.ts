import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMeetingActor } from './resolve';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
afterEach(() => vi.unstubAllGlobals());
describe('meeting identity resolution', () => {
	it('uses DIDs without making a network request', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(await resolveMeetingActor(bob)).toBe(bob);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('resolves handles against the fixed same-origin endpoint', async () => {
		vi.stubGlobal('window', { location: { origin: 'https://atmo.rsvp' } });
		const fetch = vi.fn().mockResolvedValue(Response.json({ did: bob }));
		vi.stubGlobal('fetch', fetch);
		expect(await resolveMeetingActor('bob.test')).toBe(bob);
		expect(String(fetch.mock.calls[0][0])).toBe(
			'https://atmo.rsvp/api/meet/resolve?actor=bob.test'
		);
	});
	it.each([{ did: 'not-a-did' }, { handle: 'bob.test' }, null])(
		'rejects malformed identity responses %j',
		async (body) => {
			vi.stubGlobal('window', { location: { origin: 'https://atmo.rsvp' } });
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
			await expect(resolveMeetingActor('bob.test')).rejects.toThrow('Could not resolve');
		}
	);
	it('reports failed lookup responses', async () => {
		vi.stubGlobal('window', { location: { origin: 'https://atmo.rsvp' } });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
		await expect(resolveMeetingActor('bob.test')).rejects.toThrow('Could not resolve');
	});
});
