import { describe, it, expect, vi } from 'vitest';
import { importFromUrl } from './index';
import { UpstreamError, describeUpstream, fetchImageAsDataUrl } from './http';
import { stubFetch, blockRealFetch } from './test-support';

blockRealFetch();

/**
 * The failure these cover: a source refusing us used to surface as a bare
 * "upstream 429" thrown Error, which the runtime logged by stack alone. The
 * status never reached the log, so a real outage (luma rate limiting our egress)
 * could not be diagnosed without reproducing it out of band.
 */
describe('UpstreamError', () => {
	it('puts the status, final URL and content-type in the message', () => {
		// Fields hung off an Error do not survive being logged by stack, so the
		// message has to carry them itself. Asserted by containment: the wording is
		// free to change, the three facts are not.
		const err = new UpstreamError(429, 'https://luma.com/abc', 'text/html; charset=utf-8');

		expect(err.message).toContain('429');
		expect(err.message).toContain('https://luma.com/abc');
		expect(err.message).toContain('text/html; charset=utf-8');
		expect(err.status).toBe(429);
		expect(err.finalUrl).toBe('https://luma.com/abc');
		expect(err.contentType).toBe('text/html; charset=utf-8');
	});
});

/**
 * These pin the properties the copy has to keep, not the words themselves, so
 * rewording a message stays a one-file change.
 */
describe('describeUpstream', () => {
	const STATUSES = [401, 403, 404, 418, 429, 500, 503];

	it('names the host in every case, so the user knows who refused them', () => {
		for (const status of STATUSES) {
			expect(describeUpstream(status, 'luma.com')).toContain('luma.com');
		}
	});

	it('tells the actionable cases apart', () => {
		// Rate limited, private, missing and broken are four different things to do
		// next. Collapsing any two of them back together is the regression.
		const distinct = new Set(
			[429, 403, 404, 503].map((status) => describeUpstream(status, 'example.com'))
		);

		expect(distinct.size).toBe(4);
	});

	it('gives a rate limit its own message instead of the generic fallback', () => {
		// The fallback just restates the number. A 429 is the one status the user
		// can actually act on, so it must not fall through to that.
		expect(describeUpstream(429, 'luma.com')).not.toContain('429');
	});

	it('still names the number for a status it has no advice for', () => {
		expect(describeUpstream(418, 'example.com')).toContain('418');
	});
});

describe('fetchPage failures', () => {
	it('throws an UpstreamError carrying the status a rate-limited source returned', async () => {
		stubFetch([
			{
				when: 'luma.com',
				reply: () =>
					new Response('<html>Rate Limit Hit</html>', {
						status: 429,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					})
			}
		]);

		await expect(importFromUrl('https://luma.com/qvwcytc2')).rejects.toMatchObject({
			status: 429,
			contentType: 'text/html; charset=utf-8'
		});
	});

	it('reports the URL after redirects, not the one the user pasted', async () => {
		// lu.ma 301s to luma.com. Logging the pasted URL alone sends whoever reads
		// the log to a different address than the one that actually refused us.
		stubFetch([
			{
				when: 'lu.ma',
				reply: () =>
					Object.defineProperty(new Response('nope', { status: 429 }), 'url', {
						value: 'https://luma.com/qvwcytc2'
					})
			}
		]);

		await expect(importFromUrl('https://lu.ma/qvwcytc2')).rejects.toMatchObject({
			finalUrl: 'https://luma.com/qvwcytc2'
		});
	});

	it('falls back to the requested URL when the runtime leaves res.url empty', async () => {
		stubFetch([{ when: 'example.com', reply: () => new Response('nope', { status: 500 }) }]);

		await expect(importFromUrl('https://example.com/event')).rejects.toMatchObject({
			finalUrl: 'https://example.com/event'
		});
	});
});

describe('cover image failures', () => {
	it('logs the status and stays non-fatal', async () => {
		// The image is optional: a failure must not fail the import. But it used to
		// log nothing at all, so an import arriving without its image looked exactly
		// like a source that has no image.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		stubFetch([{ when: 'cdn.example', reply: () => new Response('', { status: 403 }) }]);

		await expect(fetchImageAsDataUrl('https://cdn.example/cover.jpg')).resolves.toBeUndefined();
		const line = warn.mock.calls[0].join(' ');
		expect(line).toContain('403');
		expect(line).toContain('https://cdn.example/cover.jpg');
		warn.mockRestore();
	});
});
