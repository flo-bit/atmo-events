import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { getServerClient } from './index';
import { flattenEventRecords, listEventRecordsFromContrail } from '$lib/contrail';
import type { ActorIdentifier } from '@atcute/lexicons';

const listEventsInput = v.object({
	actor: v.optional(v.string()),
	search: v.optional(v.string()),
	startsAtMin: v.optional(v.string()),
	startsAtMax: v.optional(v.string()),
	endsAtMin: v.optional(v.string()),
	endsAtMax: v.optional(v.string()),
	rsvpsGoingCountMin: v.optional(v.number()),
	profiles: v.optional(v.boolean()),
	sort: v.optional(v.string()),
	order: v.optional(v.picklist(['asc', 'desc'])),
	limit: v.optional(v.number()),
	cursor: v.optional(v.string())
});

export const loadMoreEvents = command(listEventsInput, async (input) => {
	const { platform } = getRequestEvent();

	const client = getServerClient(platform!.env.DB);

	const response = await listEventRecordsFromContrail(client, {
		...input,
		actor: input.actor as ActorIdentifier | undefined
	});

	if (!response) {
		return { events: [] as ReturnType<typeof flattenEventRecords>, handles: {} as Record<string, string>, cursor: null as string | null };
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
});
