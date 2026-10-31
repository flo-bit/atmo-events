import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { REPORT_REASON_TYPES } from '@atmo-dev/contrail/moderation';
import {
	submitForSession,
	listForSession,
	resolveForSession,
	hideForSession,
	undoForSession
} from './operations';

const bounded = (max: number) => v.pipe(v.string(), v.maxLength(max));
const subject = v.variant('$type', [
	v.object({ $type: v.literal('com.atproto.admin.defs#repoRef'), did: bounded(2048) }),
	v.object({
		$type: v.literal('com.atproto.repo.strongRef'),
		uri: bounded(4096),
		cid: bounded(256)
	})
]);
// SvelteKit marks remote responses private, no-store. setHeaders() is forbidden
// inside remote functions; use the request only to read the authenticated locals.
export const submitReport = command(
	v.object({
		subject,
		reasonType: v.picklist(REPORT_REASON_TYPES),
		reason: v.optional(bounded(20_000))
	}),
	(input) => submitForSession(getRequestEvent().locals, input)
);

// A command rather than a query: no shared query cache contains private reports.
export const loadReports = command(
	v.object({
		status: v.optional(v.picklist(['open', 'resolved'])),
		limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
		cursor: v.optional(bounded(1024))
	}),
	(input) => listForSession(getRequestEvent().locals, input)
);
export const resolveReport = command(
	v.object({
		id: v.pipe(v.number(), v.integer(), v.minValue(0)),
		resolution: v.optional(bounded(4000)),
		actionUri: v.optional(bounded(4096))
	}),
	(input) => resolveForSession(getRequestEvent().locals, input)
);
export const hideSubject = command(
	v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
	(input) => hideForSession(getRequestEvent().locals, input)
);
export const undoAction = command(v.object({ uri: bounded(4096) }), (input) =>
	undoForSession(getRequestEvent().locals, input.uri)
);
