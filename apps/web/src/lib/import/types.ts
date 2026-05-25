import type { EventImportPrefill } from '$lib/import-event';

/** A URL fetched once and shared across importers for a single import run. */
export type FetchedPage = {
	/** URL after any redirects. */
	finalUrl: string;
	/** Lowercased `content-type` header (may be empty). */
	contentType: string;
	/** Response body, truncated to MAX_BYTES. */
	text: string;
};

/**
 * State passed to each importer for one import. `getPage()` lazily fetches the
 * source URL and caches the result, so several content-based importers can
 * inspect the same page without re-fetching. URL-based importers (e.g. ra.co)
 * never call it and so never trigger a fetch they can't use.
 */
export type ImportContext = {
	/** The URL the user pasted. */
	url: string;
	/**
	 * Fetch the source URL (once). Rejects on a non-OK upstream so the caller
	 * surfaces a 502 rather than silently reporting "no event found".
	 */
	getPage(): Promise<FetchedPage>;
};

/**
 * A source-specific importer. The registry tries each in order; the first whose
 * `accept()` returns true owns the request and its `parseData()` result — even
 * `null` — is final (we do not fall through to a later importer). Accept
 * conditions are mutually exclusive in practice (a response is a calendar feed
 * OR an HTML page OR a known host), which keeps that rule unambiguous.
 */
export type EventImporter = {
	/** Stable identifier, for logs. */
	name: string;
	/**
	 * Whether this importer handles the context. URL-based importers inspect
	 * `ctx.url`; content-based ones `await ctx.getPage()`.
	 */
	accept(ctx: ImportContext): boolean | Promise<boolean>;
	/** Parse the event, or return null when nothing usable is found. */
	parseData(ctx: ImportContext): Promise<EventImportPrefill | null>;
};
