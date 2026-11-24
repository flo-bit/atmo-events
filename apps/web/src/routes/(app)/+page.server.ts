import { env, waitUntil } from 'cloudflare:workers';
import {
	flattenEventRecord,
	flattenEventRecords,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail,
	withD1Retry
} from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import { cachedRead } from '#lib/server/edge-cache.js';
import { dedupeByUri } from '#lib/dedupe-by-uri.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { privateEventsBeta } from '#lib/private-events/server/beta.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';
import { myPrivateEvents, type MyPrivateEvent } from '#lib/private-events/server/events.js';
import { withPrivateEvents, type PrivateLink } from '#lib/private-events/your-events.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';
import type { PageServerLoad } from './$types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** TTL for the global (non-personalized) home-page surface. It's identical for
 *  every visitor, so we serve it from the colo edge cache and only hit D1 on a
 *  miss. Short enough that new events/RSVPs surface within ~a minute. */
const GLOBAL_CACHE_TTL_S = 60;
/** How long Your events waits on the person's own server for their private events before it shows
 *  their public ones alone. */
const PRIVATE_EVENTS_WAIT_MS = 4000;

/** Their own private events, hosted or answered, for Your events: only with private events and their
 *  beta on, and a grant to read them. Null when there are none to add. `incomplete` when some may be
 *  missing: a read failed or ran out of time, or there were more than were listed. The page never
 *  waits long or fails for them. */
async function ownPrivateEvents(
	locals: App.Locals
): Promise<{ events: MyPrivateEvent[]; incomplete: boolean } | null> {
	if (!locals.did || !privateEventsEnabled()) return null;
	// The session and its grant are known here; only the beta setting is on their server, so it is
	// asked last, and someone without a grant costs this page nothing.
	let betaOn = false;
	const read = async () => {
		const caller = await callerSession(locals.session ?? null);
		if (!caller) return null;
		if (!holdsGuestGrant(caller.scope) && !holdsHostGrant(caller.scope, caller.did)) return null;
		if (!(await privateEventsBeta(locals))) return null;
		betaOn = true;
		const { events, incomplete } = await myPrivateEvents(caller);
		return { events, incomplete };
	};
	// Kept going past the wait: a Worker cuts off what a response leaves running, which could leave
	// their session's lock held and stall their next request.
	const reading = read();
	waitUntil(reading.catch(() => {}));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((resolve) => {
		timer = setTimeout(() => resolve('late'), PRIVATE_EVENTS_WAIT_MS);
	});
	try {
		const found = await Promise.race([reading, late]);
		if (found !== 'late') return found;
		return betaOn ? { events: [], incomplete: true } : null;
	} catch (e) {
		console.error(`[private-events] private events unread for the home page: ${errorKind(e)}`);
		return betaOn ? { events: [], incomplete: true } : null;
	} finally {
		clearTimeout(timer);
	}
}

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const publicClient = getServerClient(env.DB);
	const nowIso = new Date().toISOString();

	const myEventsPromise = (async () => {
		if (!locals.did) return { upcoming: [], past: [] };
		const did = locals.did;

		const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
		const cutoffIso = cutoff.toISOString();

		const [rsvpResponse, hostingResponse] = await withD1Retry(() =>
			Promise.all([
				publicClient.get('rsvp.atmo.rsvp.listRecords', {
					params: { actor: did, hydrateEvent: true, limit: 100 }
				}),
				listEventRecordsFromContrail(publicClient, {
					actor: did,
					startsAtMin: cutoffIso,
					sort: 'startsAt',
					order: 'asc',
					limit: 100
				})
			])
		);

		const rsvpEvents = (rsvpResponse.ok ? (rsvpResponse.data.records ?? []) : [])
			.filter((r) => {
				const status = r.value?.status;
				return status?.endsWith('#going') || status?.endsWith('#interested');
			})
			.flatMap((r) => {
				if (!r.event) return [];
				const flat = flattenEventRecord(r.event);
				return flat ? [flat] : [];
			})
			.filter((e) => new Date(e.endsAt || e.startsAt) >= cutoff);

		const hostingEvents = hostingResponse ? flattenEventRecords(hostingResponse.records) : [];

		const all = dedupeByUri([...rsvpEvents, ...hostingEvents]);

		const nowMs = Date.now();
		const upcoming = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
			.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
		const past = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
			.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

		return { upcoming, past };
	})();

	// Global discovery list — same for every visitor, so cache it at the edge.
	// The key is static (no per-request `nowIso`), so a hit just means the
	// `startsAtMin` filter is up to one TTL stale — harmless for "upcoming".
	const globalPromise = cachedRead('home:discoverable', GLOBAL_CACHE_TTL_S, () =>
		withD1Retry(() =>
			listDiscoverableEventsFromContrail(publicClient, {
				startsAtMin: nowIso,
				rsvpsCountMin: 2,
				hydrateRsvps: 5,
				sort: 'startsAt',
				order: 'asc',
				limit: 20
			})
		)
	);

	const [publicOnes, response, ownPrivate] = await Promise.all([
		myEventsPromise,
		globalPromise,
		ownPrivateEvents(locals)
	]);
	// Their own private events join their public ones, seen only by them, so this page is kept nowhere.
	let myEvents: { upcoming: typeof publicOnes.upcoming; past: typeof publicOnes.past } = publicOnes;
	let privateLinks: Record<string, PrivateLink> = {};
	if (ownPrivate && ownPrivate.events.length > 0) {
		const now = Date.now();
		({ privateLinks, ...myEvents } = withPrivateEvents(
			publicOnes,
			ownPrivate.events,
			now,
			now - SEVEN_DAYS_MS
		));
	}
	// Saying some are missing tells as much as listing them does.
	const privateEventsIncomplete = ownPrivate?.incomplete ?? false;
	if (Object.keys(privateLinks).length > 0 || privateEventsIncomplete) {
		setHeaders({ 'cache-control': 'private, no-store' });
	}

	if (!response) {
		return {
			events: [],
			handles: {} as Record<string, string>,
			myUpcoming: myEvents.upcoming,
			myPast: myEvents.past,
			privateLinks,
			privateEventsIncomplete
		};
	}

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles,
		myUpcoming: myEvents.upcoming,
		myPast: myEvents.past,
		privateLinks,
		privateEventsIncomplete
	};
};
