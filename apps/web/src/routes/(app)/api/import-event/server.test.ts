import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { blockRealFetch, stubFetch, textReply } from '$lib/import/test-support';

blockRealFetch();
afterEach(() => vi.restoreAllMocks());

function request(url: string, did: string | null = 'did:plc:test') {
	return {
		locals: { did },
		request: new Request('https://atmo.test/api/import-event', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		})
	} as unknown as Parameters<typeof POST>[0];
}

describe('import-event upstream errors', () => {
	it('reports an upstream 429 as temporary unavailability, preserving Retry-After', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubFetch([
			{
				when: 'https://example.com/event',
				reply: () =>
					new Response('limited', {
						status: 429,
						headers: { 'retry-after': '120' }
					})
			}
		]);
		const response = await POST(request('https://example.com/event'));
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('120');
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining('rate-limiting')
		});
	});

	it('uses the same rate-limit message for Luma API failures', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubFetch([
			{
				when: 'https://api2.luma.com/event/get',
				reply: () => new Response('limited', { status: 429 })
			}
		]);
		const response = await POST(request('https://luma.com/toughtech-6pg5'));
		expect(response.status).toBe(503);
		expect(response.headers.has('retry-after')).toBe(false);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining('rate-limiting')
		});
	});

	it('distinguishes a blocked request from a parser error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubFetch([
			{ when: 'https://example.com/event', reply: () => new Response('blocked', { status: 403 }) }
		]);
		const response = await POST(request('https://example.com/event'));
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining('blocked the import request')
		});
	});

	it('retains the no-data response for a successfully fetched empty page', async () => {
		stubFetch([
			{
				when: 'https://example.com/event',
				reply: () => textReply('<html><body>No event</body></html>')
			}
		]);
		const response = await POST(request('https://example.com/event'));
		expect(response.status).toBe(422);
	});

	it('still requires authentication before making any upstream request', async () => {
		const response = await POST(request('https://luma.com/toughtech-6pg5', null));
		expect(response.status).toBe(401);
	});
});
