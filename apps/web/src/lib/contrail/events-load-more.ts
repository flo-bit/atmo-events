import * as v from 'valibot';
import { getServerClient } from './index';
import {
	flattenEventRecords,
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { parseCursor, tagCursor } from './cursor';
import type { ActorIdentifier } from '@atcute/lexicons';

export const listEventsInput = v.object({
	actor: v.optional(v.string()),
	search: v.optional(v.string()),
	startsAtMin: v.optional(v.string()),
	startsAtMax: v.optional(v.string()),
	endsAtMin: v.optional(v.string()),
	endsAtMax: v.optional(v.string()),
	rsvpsCountMin: v.optional(v.number()),
	rsvpsGoingCountMin: v.optional(v.number()),
	profiles: v.optional(v.boolean()),
	sort: v.optional(v.string()),
	order: v.optional(v.picklist(['asc', 'desc'])),
	limit: v.optional(v.number()),
	cursor: v.optional(v.string()),
	// Which page-1 read pipeline this list came from. load-more MUST re-run the
	// same pipeline or it drifts: 'discoverable' (home) drops the unlisted-event
	// filter, 'authored' (profile hosting/past) drops the conference-talk filter,
	// and either leaks records page 1 excluded. Absent => plain listRecords.
	pipeline: v.optional(v.picklist(['discoverable', 'authored']))
});

export type LoadMoreEventsInput = v.InferOutput<typeof listEventsInput>;

export type LoadMoreEventsResult = {
	events: ReturnType<typeof flattenEventRecords>;
	handles: Record<string, string>;
	cursor: string | null;
};

/**
 * Shared load-more handler. Kept out of the `.remote.ts` adapter so it is a
 * plain function the SvelteKit remote-functions plugin won't wrap — that lets it
 * be unit-tested directly (the plugin rejects non-remote exports from
 * `*.remote.ts`, so a test there can't mock `$app/server`).
 */
export async function runLoadMoreEvents(
	env: App.Platform['env'],
	input: LoadMoreEventsInput
): Promise<LoadMoreEventsResult> {
	const client = getServerClient(env.DB);

	// Route by the cursor's own tag, not by re-deriving the backend from request
	// shape. The page that issued this cursor already committed to a backend;
	// load-more MUST continue on that same one or first-load and load-more diverge
	// and hand over an incompatible cursor (om-7dbs).
	const { backend: cursorBackend, raw: cursorRaw } = parseCursor(input.cursor);

	// Only resolve the Meili backend when a search term is present (matches the
	// search page's first-page path); avoids touching it for plain D1 loads.
	const searchTerm = input.search?.trim();
	const searchBackend = searchTerm ? searchBackendFromEnv(env) : null;

	// Meili path when: the cursor is explicitly meili-tagged, OR it's an untagged
	// legacy cursor (in-flight from before this deploy) and the old inference
	// ("search set AND Meili configured") would have chosen Meili. A d1-tagged
	// cursor is NEVER routed here, even with a search term + configured backend —
	// that is exactly the divergence the tag exists to prevent.
	const routeMeili =
		cursorBackend === 'meili' || (cursorBackend === null && !!searchBackend && !!searchTerm);
	if (routeMeili) {
		if (!searchBackend || !searchTerm) {
			// A meili-tagged cursor arrived but this context can't serve Meili (the
			// backend is now unconfigured, or the search term was lost from the
			// continuation). Feeding the offset to D1 listRecords would ignore it and
			// drop filters, and re-inferring would restart page 1 on the wrong
			// backend. Fail safe: end pagination cleanly. Errors otherwise propagate
			// to EventList's catch so the user can retry with the cursor intact.
			return { events: [], handles: {}, cursor: null };
		}
		const page = await runEventSearchPage(searchBackend, client, {
			q: searchTerm,
			// Pass the untagged offset; runEventSearchPage also strips a meili tag
			// itself, so a legacy bare offset works here too.
			cursor: cursorRaw
		});
		return { events: page.events, handles: page.handles, cursor: page.cursor };
	}

	// D1 path: an explicit d1 tag, or an untagged cursor with no Meili search
	// context. Re-run the SAME page-1 pipeline so load-more inherits its filters.
	// `pipeline` is our selector, not an xrpc param, so strip it. `cursor` is
	// overwritten below with the untagged keyset (the inbound one carries the tag).
	const { pipeline, ...rest } = input;
	const params = {
		...rest,
		actor: rest.actor as ActorIdentifier | undefined,
		cursor: cursorRaw ?? undefined
	};

	const response =
		pipeline === 'discoverable'
			? await listDiscoverableEventsFromContrail(client, params)
			: pipeline === 'authored'
				? await listAuthoredEventsFromContrail(client, params)
				: await listEventRecordsFromContrail(client, params);

	if (!response) {
		return { events: [], handles: {}, cursor: null };
	}

	const events = flattenEventRecords(response.records ?? []);

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events,
		handles,
		// Tag the keyset with the D1 backend so the next load-more stays on D1 and
		// can't be re-inferred onto Meili (om-7dbs).
		cursor: tagCursor('d1', response.cursor ?? null)
	};
}
