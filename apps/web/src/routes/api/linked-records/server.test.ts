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
		{ actor: did, cursor: 'a'.repeat(2049) },
		{ collection: 'https://semble.so/profile/alice.example' },
		{ collection: `at://${did}/network.cosmik.collection/one`, actor: did },
		{ collections: 'bad actor' },
		{ collections: did, cursor: 'next' }
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
	it('returns a Semble collection and a page of collections', async () => {
		const uri = `at://${did}/network.cosmik.collection/one`;
		const collection = {
			uri,
			name: 'Reading list',
			author: { id: did, name: 'Alice', handle: 'alice.example' },
			cardCount: 1,
			urlCards: [{ id: 'card', url: 'https://example.com/', cardContent: { title: 'Example' } }]
		};
		const fetcher = vi.fn(async (input: URL) =>
			input.pathname.endsWith('listByUser')
				? new Response(
						JSON.stringify({
							collections: [collection],
							pagination: { currentPage: 2, hasMore: true }
						})
					)
				: new Response(JSON.stringify(collection))
		) as unknown as typeof fetch;
		const one = await request({ collection: uri }, fetcher);
		expect(await one.json()).toMatchObject({
			uri,
			url: `https://semble.so/profile/${did}/collections/one`,
			cards: [{ url: 'https://example.com/', title: 'Example' }]
		});
		expect(one.headers.get('cache-control')).toBe('public, max-age=60');
		const list = await request({ collections: did, cursor: '2' }, fetcher);
		expect(await list.json()).toMatchObject({ collections: [{ uri }], cursor: '3' });
		const [url, options] = vi.mocked(fetcher).mock.calls[1] as unknown as [URL, RequestInit];
		expect(url.origin).toBe('https://api.semble.so');
		expect(url.searchParams.get('page')).toBe('2');
		expect(options).toMatchObject({ redirect: 'manual', credentials: 'omit' });
	});
	it.each<Record<string, string>>([
		{ actor: did },
		{ gallery: `at://${did}/social.grain.gallery/one` },
		{ collections: did },
		{ collection: `at://${did}/network.cosmik.collection/one` }
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
