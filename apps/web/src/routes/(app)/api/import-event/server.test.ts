import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Mock the import pipeline so the test exercises only the route's error
// handling: which status it returns, and which message it selects. vi.hoisted
// keeps the spies reachable from the hoisted vi.mock factory.
const { importFromUrl, fetchImageAsDataUrl } = vi.hoisted(() => ({
	importFromUrl: vi.fn(),
	fetchImageAsDataUrl: vi.fn(async () => undefined)
}));

vi.mock('$lib/import', async (importActual) => {
	const actual = await importActual<typeof import('$lib/import')>();
	return { ...actual, importFromUrl, fetchImageAsDataUrl };
});

import { POST } from './+server';
import { UpstreamError, describeUpstream } from '$lib/import';

/**
 * These assert against `describeUpstream` rather than restating its copy, so
 * rewording a message needs no test edit. What is pinned here is the wiring:
 * which status the route answers with, and that it picks the message for the
 * status it actually got. The copy itself is covered in the import unit tests.
 */

/** The handler always answers JSON. These are the only fields any branch returns. */
async function body(res: Response): Promise<{ error?: string; name?: string }> {
	return (await res.json()) as { error?: string; name?: string };
}

/** Minimal RequestEvent shape the handler reads: a JSON body and a signed-in did. */
function event(url: string, did: string | null = 'did:plc:someone') {
	return {
		request: new Request('https://atmo.rsvp/api/import-event', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		}),
		locals: { did }
	} as unknown as Parameters<typeof POST>[0];
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	errorLog.mockRestore();
});

describe('import-event upstream failures', () => {
	it('passes a rate limit through as 429, not as a generic 502', async () => {
		// The bug this pins: luma rate-limits our Cloudflare Worker egress, and the
		// user saw a 502 with "Failed to fetch or parse that URL.", which reads as
		// "this URL is broken" rather than "try again in a minute".
		importFromUrl.mockRejectedValue(
			new UpstreamError(429, 'https://luma.com/qvwcytc2', 'text/html')
		);

		const res = await POST(event('https://luma.com/qvwcytc2'));

		expect(res.status).toBe(429);
		expect((await body(res)).error).toBe(describeUpstream(429, 'luma.com'));
	});

	// Two representative statuses. Which message each status maps to is covered by
	// describeUpstream's own tests; what these pin is that the route feeds it the
	// status it actually got and answers 502 for everything that is not a limit.
	it.each([
		{ status: 403, host: 'partiful.com' },
		{ status: 503, host: 'example.com' }
	])('answers 502 for upstream $status with that status’s message', async ({ status, host }) => {
		importFromUrl.mockRejectedValue(new UpstreamError(status, `https://${host}/e`));

		const res = await POST(event(`https://${host}/e`));

		// Everything that is not a rate limit stays 502: the source gave us
		// something we cannot turn into an event, which is what 502 means.
		expect(res.status).toBe(502);
		expect((await body(res)).error).toBe(describeUpstream(status, host));
	});

	it('names the host from the URL the user pasted', async () => {
		// Not the redirect target: the user pasted lu.ma, and telling them about a
		// host they never typed would be confusing.
		importFromUrl.mockRejectedValue(new UpstreamError(429, 'https://luma.com/qvwcytc2'));

		const res = await POST(event('https://lu.ma/qvwcytc2'));

		expect((await body(res)).error).toContain('lu.ma');
	});

	it('logs one line naming the status and the final URL', async () => {
		// The acceptance criterion: reproducing an import failure from logs alone.
		importFromUrl.mockRejectedValue(
			new UpstreamError(429, 'https://luma.com/qvwcytc2', 'text/html')
		);

		await POST(event('https://lu.ma/qvwcytc2'));

		const line = errorLog.mock.calls[0].join(' ');
		expect(line).toContain('429');
		expect(line).toContain('https://luma.com/qvwcytc2');
	});

	it('does not log a bare Error object, which the runtime renders by stack alone', async () => {
		importFromUrl.mockRejectedValue(new UpstreamError(429, 'https://luma.com/x', 'text/html'));

		await POST(event('https://luma.com/x'));

		// Every logged argument must be a string. Handing the platform an Error is
		// exactly how the status got swallowed before.
		for (const arg of errorLog.mock.calls[0]) {
			expect(typeof arg).toBe('string');
		}
	});

	it('leaves a non-upstream failure on the generic message', async () => {
		// A parse bug is ours, not the source's. Naming the host would be wrong.
		importFromUrl.mockRejectedValue(new TypeError('cannot read properties of undefined'));

		const res = await POST(event('https://example.com/e'));

		expect(res.status).toBe(502);
		expect((await body(res)).error).not.toContain('example.com');
	});
});

describe('import-event success path', () => {
	// Kept as a positive control. Every other case here drives a rejection, so a
	// harness fault that made importFromUrl always throw would leave them all
	// green. This is the one that would go red.
	it('is unaffected by the error handling', async () => {
		importFromUrl.mockResolvedValue({ source: 'https://example.com/e', name: 'Some Event' });

		const res = await POST(event('https://example.com/e'));

		expect(res.status).toBe(200);
		expect((await body(res)).name).toBe('Some Event');
	});
});
