import type { EventImportPrefill } from '$lib/import-event';
import type { EventImporter, FetchedPage, ImportContext } from './types';
import { FETCH_HEADERS, MAX_BYTES, readLimited } from './http';
import { racoImporter } from './raco';
import { icalImporter } from './ical';
import { webpageImporter } from './webpage';

/**
 * Registry of source-specific importers, tried in order. Put the most specific
 * (host-matched, no fetch) first and the generic HTML fallback last. To support
 * a new platform, add a module exporting an `EventImporter` and list it here.
 */
export const importers: EventImporter[] = [racoImporter, icalImporter, webpageImporter];

/**
 * Run the import pipeline for a URL. The first importer whose `accept()` returns
 * true owns the result — including `null` (nothing found) — so a known host that
 * comes up empty doesn't fall through to a generic fetch it can't satisfy.
 */
export async function importFromUrl(url: string): Promise<EventImportPrefill | null> {
	const ctx = createImportContext(url);
	for (const importer of importers) {
		if (await importer.accept(ctx)) {
			return importer.parseData(ctx);
		}
	}
	return null;
}

function createImportContext(url: string): ImportContext {
	let pagePromise: Promise<FetchedPage> | null = null;
	return {
		url,
		getPage() {
			pagePromise ??= fetchPage(url);
			return pagePromise;
		}
	};
}

async function fetchPage(url: string): Promise<FetchedPage> {
	const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
	if (!res.ok) throw new Error(`upstream ${res.status}`);
	const contentType = (res.headers.get('content-type') || '').toLowerCase();
	const text = await readLimited(res, MAX_BYTES);
	return { finalUrl: res.url || url, contentType, text };
}

export { fetchImageAsDataUrl } from './http';
export type { EventImporter, ImportContext, FetchedPage } from './types';
