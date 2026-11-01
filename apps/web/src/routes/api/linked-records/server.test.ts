import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server.js';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
function request(query: Record<string, string>, fetcher: typeof fetch = vi.fn()) {
	return GET({
		url: new URL(`https://atmo.rsvp/api/linked-records?${new URLSearchParams(query)}`),
		fetch: fetcher
	} as Parameters<typeof GET>[0]);
}

describe('public linked-record reads', () => {
	it.each<Record<string, string>>([
		{},
		{ gallery: 'https://evil.test' },
		{ actor: 'bad actor' },
		{ actor: did, gallery: `at://${did}/social.grain.gallery/one` },
		{ actor: did, cursor: 'a'.repeat(2049) }
	])('rejects invalid query %j before fetching', async (query) => {
		const fetcher = vi.fn();
		await expect(request(query, fetcher)).rejects.toMatchObject({ status: 400 });
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('returns a short-cache public album page', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [], cursor: 'next' })));
		const response = await request({ actor: did }, fetcher);
		expect(await response.json()).toEqual({ albums: [], cursor: 'next' });
		expect(response.headers.get('cache-control')).toBe('public, max-age=60');
		expect(fetcher).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({ redirect: 'manual', credentials: 'omit' })
		);
	});
	it.each<Record<string, string>>([
		{ actor: did },
		{ gallery: `at://${did}/social.grain.gallery/one` }
	])('rejects redirects without following them: %j', async (query) => {
		const fetcher = vi.fn(
			async () => new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
		);
		await expect(request(query, fetcher)).rejects.toMatchObject({ status: 502 });
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({ redirect: 'manual', credentials: 'omit' })
		);
	});
	it('fails cleanly without caching an upstream error', async () => {
		const fetcher = vi.fn(async () => new Response('', { status: 503 }));
		await expect(request({ actor: did }, fetcher)).rejects.toMatchObject({ status: 502 });
	});
});
