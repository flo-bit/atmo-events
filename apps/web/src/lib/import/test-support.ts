import { vi, beforeEach, afterEach } from 'vitest';
import type { FetchedPage, ImportContext } from './types';

/**
 * Shared test harness for the import pipeline.
 *
 * Every importer reaches the network through the global `fetch` — a source API
 * (ra.co), an HTML page (webpage), an `.ics` feed (ical), plus the cover image.
 * These helpers stub that `fetch` with an ordered route table so an importer can
 * be driven against captured fixtures with zero live network.
 *
 * The shape is deliberately source-agnostic: adding tests for the next importer
 * is "capture a real response as a fixture, list its routes, assert the mapped
 * prefill" — the same three moves used in `raco.test.ts`.
 */

export type FetchRoute = {
	/** Match against the request URL: substring, regex, or predicate. */
	when: string | RegExp | ((url: string) => boolean);
	/** Build the response for a matched request. */
	reply: (url: string, init?: RequestInit) => Response | Promise<Response>;
};

export type StubbedFetch = {
	/** Every URL `fetch` was called with, in order — for asserting what was (not) hit. */
	urls: string[];
	/** The underlying vi mock, for call-count assertions. */
	mock: ReturnType<typeof vi.fn>;
};

/**
 * Replace the global `fetch` with an ordered route table (first match wins). An
 * unmatched request throws, so a test can never silently escape to the real
 * network. Restore with `vi.unstubAllGlobals()` in an `afterEach`.
 */
export function stubFetch(routes: FetchRoute[]): StubbedFetch {
	const urls: string[] = [];
	const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: String((input as Request).url ?? input);
		urls.push(url);
		for (const route of routes) {
			const hit =
				typeof route.when === 'function'
					? route.when(url)
					: route.when instanceof RegExp
						? route.when.test(url)
						: url.includes(route.when);
			if (hit) return route.reply(url, init);
		}
		throw new Error(`unstubbed fetch: ${url}`);
	});
	vi.stubGlobal('fetch', mock);
	return { urls, mock };
}

/** A JSON response (200 unless overridden), Content-Type `application/json`. */
export function jsonReply(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** A binary image response, for importers that call `fetchImageAsDataUrl`. */
export function imageReply(
	contentType = 'image/png',
	bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
): Response {
	return new Response(bytes, { status: 200, headers: { 'content-type': contentType } });
}

/**
 * A text response — an HTML page (webpage importer) or an `.ics` feed (ical).
 * Content-Type defaults to `text/html`; pass `text/calendar` for a feed.
 */
export function textReply(body: string, contentType = 'text/html'): Response {
	return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

/**
 * Build a `FetchedPage` for unit-testing a content-based importer (ical/webpage)
 * directly, without the pipeline's real fetch: return it from the `getPage` you
 * hand to `importContext`. Defaults are a benign HTML page; override what the
 * case cares about (usually `contentType` and `text`).
 */
export function fetchedPage(overrides: Partial<FetchedPage> = {}): FetchedPage {
	return {
		finalUrl: 'https://example.com/event',
		contentType: 'text/html',
		text: '',
		...overrides
	};
}

/**
 * A minimal `ImportContext` for a URL-matched importer (e.g. raco). `getPage()`
 * throws by default, which asserts the importer never triggers a page fetch it
 * cannot use. Pass `getPage` to exercise a content-based importer.
 */
export function importContext(url: string, getPage?: ImportContext['getPage']): ImportContext {
	return {
		url,
		getPage:
			getPage ??
			(() => {
				throw new Error('getPage() must not be called by a URL-matched importer');
			})
	};
}

/**
 * Guarantee a suite never reaches the real network. Call once at the top level
 * of a test file: before each test the global `fetch` is replaced with one that
 * throws, so a test that forgets `stubFetch()` fails loudly instead of silently
 * hitting the internet. `stubFetch()` overrides it per-test, and originals are
 * restored afterward. Replaces a bare `afterEach(() => vi.unstubAllGlobals())`.
 */
export function blockRealFetch(): void {
	beforeEach(() => {
		vi.stubGlobal('fetch', () => {
			throw new Error('real fetch blocked: call stubFetch([...routes]) in this test');
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});
}
