import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({
	handleContrailRequest: vi.fn(async () => Response.json({ ok: true }))
}));
import { handleContrailRequest } from '#lib/contrail/index.js';
import { GET, POST } from './+server';
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
function event({
	actor = did as string | null,
	origin = 'https://atmo.rsvp',
	path = 'rsvp.atmo.notifyOfUpdate',
	body = JSON.stringify({ uri: `at://${did}/community.lexicon.calendar.event/one` })
} = {}) {
	const url = new URL(`https://atmo.rsvp/xrpc/${path}`);
	return {
		url,
		locals: { did: actor },
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body
		})
	} as Parameters<typeof POST>[0];
}
afterEach(() => vi.clearAllMocks());
describe('same-Worker XRPC boundary', () => {
	it('allows anonymous read queries with CORS', async () => {
		const result = await GET({
			request: new Request('https://atmo.rsvp/xrpc/rsvp.atmo.event.listRecords')
		} as Parameters<typeof GET>[0]);
		expect(result.status).toBe(200);
		expect(result.headers.get('access-control-allow-origin')).toBe('*');
	});
	it('requires a session and same-origin browser mutations', async () => {
		expect((await POST(event({ actor: null }))).status).toBe(401);
		expect((await POST(event({ origin: 'https://evil.example' }))).status).toBe(403);
		expect(handleContrailRequest).not.toHaveBeenCalled();
	});
	it('only allows authoritative notifications owned by the session DID', async () => {
		expect(
			(
				await POST(
					event({
						body: JSON.stringify({
							uri: 'at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/community.lexicon.calendar.event/one'
						})
					})
				)
			).status
		).toBe(403);
		expect((await POST(event())).status).toBe(200);
		expect(handleContrailRequest).toHaveBeenCalledTimes(1);
	});
	it('does not expose private report mutations or bypass routes', async () => {
		expect((await POST(event({ path: 'com.atproto.moderation.createReport' }))).status).toBe(404);
		expect((await POST(event({ path: 'rsvp.atmo.moderation.resolveReport' }))).status).toBe(404);
		expect(handleContrailRequest).not.toHaveBeenCalled();
	});
	it('bounds the actual notification body before handing it to Contrail', async () => {
		expect((await POST(event({ body: 'a'.repeat(33_000) }))).status).toBe(413);
		expect((await POST(event({ body: 'invalid JSON' }))).status).toBe(400);
		expect(handleContrailRequest).not.toHaveBeenCalled();
	});
});
