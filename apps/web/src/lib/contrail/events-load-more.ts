import * as v from 'valibot';
import { getServerClient } from './index';
import {
	flattenEventRecords,
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
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

	// Text-search pagination goes through Meilisearch when configured, matching
	// the search page's first-page path — its cursor is a Meili offset, which
	// the D1 path below cannot consume (and vice versa). Errors propagate to
	// EventList's catch so the user can retry with the cursor intact.
	const searchBackend = input.search?.trim() ? searchBackendFromEnv(env) : null;
	if (searchBackend && input.search) {
		const page = await runEventSearchPage(searchBackend, client, {
			q: input.search.trim(),
			cursor: input.cursor ?? null
		});
		return { events: page.events, handles: page.handles, cursor: page.cursor };
	}

	// Re-run the SAME page-1 pipeline so load-more inherits its filters. `pipeline`
	// is our selector, not an xrpc param, so strip it before the call.
	const { pipeline, ...rest } = input;
	const params = { ...rest, actor: rest.actor as ActorIdentifier | undefined };

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
		cursor: response.cursor ?? null
	};
}
