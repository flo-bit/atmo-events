/**
 * Publishes a throwaway test conference + a handful of talk events to your repo,
 * so you can see the generalized conference timetable render on the event page.
 *
 * Run (from apps/web):
 *   bun run scripts/publish-test-conference.ts <handle-or-did>
 *
 * It authenticates via OAuth (loopback, no client_id needed), writes one
 * `type: 'conference'` event plus several talks that point back at it via
 * `additionalData.parentEvent`, then pings the app's notifyOfUpdate so Contrail
 * indexes them immediately. Prints the conference URL at the end.
 *
 * Override the app it pings (for local dev) with ATMO_APP_URL, e.g.
 *   ATMO_APP_URL=http://localhost:5173 bun run scripts/publish-test-conference.ts alice.test
 */
import { Client, ok } from '@atcute/client';
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import {
	MemoryStore,
	OAuthClient,
	type StoredState,
	scope
} from '@atcute/oauth-node-client';
import { resolveTxt } from 'node:dns/promises';

const TEN_MINUTES_MS = 10 * 60_000;
const COLLECTION = 'community.lexicon.calendar.event';
const APP_URL = (process.env.ATMO_APP_URL ?? 'https://atmo.rsvp').replace(/\/$/, '');
const TZ = 'America/New_York';

const identifier = process.argv[2]?.trim();
if (!identifier) {
	console.error('usage: bun run scripts/publish-test-conference.ts <handle-or-did>');
	console.error('  example: bun run scripts/publish-test-conference.ts alice.bsky.social');
	process.exit(1);
}
if (!isActorIdentifier(identifier)) {
	console.error(`error: invalid identifier "${identifier}" (expected a handle or did:...)`);
	process.exit(1);
}

// Minimal DNS handle resolver (the @atcute identity-resolver-node package isn't
// installed here) — looks up the `_atproto.<handle>` TXT record for `did=...`.
class DnsHandleResolver {
	async resolve(handle: string): Promise<`did:${string}`> {
		const records = await resolveTxt(`_atproto.${handle}`).catch(() => [] as string[][]);
		for (const chunks of records) {
			const txt = Array.isArray(chunks) ? chunks.join('') : String(chunks);
			if (txt.startsWith('did=')) return txt.slice(4) as `did:${string}`;
		}
		throw new Error(`could not resolve handle "${handle}" via DNS`);
	}
}

// ---- OAuth (loopback) -------------------------------------------------------

const deferred = Promise.withResolvers<URLSearchParams>();

using server = Bun.serve({
	port: 0,
	fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === '/callback') {
			deferred.resolve(url.searchParams);
			return new Response(
				'<!doctype html><title>authenticated</title><h1>authenticated!</h1><p>You can close this window and return to the terminal.</p>',
				{ headers: { 'content-type': 'text/html' } }
			);
		}
		return new Response('not found', { status: 404 });
	}
});
server.unref();

const redirectUri = `http://127.0.0.1:${server.port}/callback`;
const timeout = setTimeout(() => deferred.reject(new Error('OAuth callback timed out')), 5 * 60_000);

const oauth = new OAuthClient({
	metadata: {
		redirect_uris: [redirectUri],
		// Write access to the calendar-event collection is all we need.
		scope: [scope.repo({ collection: [COLLECTION] })]
	},
	actorResolver: new LocalActorResolver({
		handleResolver: new CompositeHandleResolver({
			methods: {
				dns: new DnsHandleResolver(),
				http: new WellKnownHandleResolver()
			}
		}),
		didDocumentResolver: new CompositeDidDocumentResolver({
			methods: {
				plc: new PlcDidDocumentResolver(),
				web: new WebDidDocumentResolver()
			}
		})
	}),
	stores: {
		sessions: new MemoryStore({ maxSize: 10 }),
		states: new MemoryStore<string, StoredState>({
			maxSize: 10,
			ttl: TEN_MINUTES_MS,
			ttlAutopurge: true
		})
	}
});

const { url } = await oauth.authorize({
	target: { type: 'account', identifier },
	redirectUri
});

console.log(`\nopen this URL in your browser to authorize:\n${url.href}\n`);

const params = await deferred.promise;
clearTimeout(timeout);

const { session } = await oauth.callback(params, { redirectUri });
const rpc = new Client({ handler: session });
const did = session.did;
console.log(`authenticated as: ${did}\n`);

// ---- Build the conference + talks -------------------------------------------

const nowIso = new Date().toISOString();

// Base the schedule on tomorrow at 14:00 UTC (~10am ET), so the countdown shows.
const dayStart = new Date(Date.now() + 24 * 60 * 60_000);
dayStart.setUTCHours(14, 0, 0, 0);
const at = (offsetMin: number) => new Date(dayStart.getTime() + offsetMin * 60_000).toISOString();

const ROOM_MAIN = 'Main Hall';
const ROOM_WORKSHOP = 'Workshop Room';

async function createEvent(record: Record<string, unknown>): Promise<{ uri: string; rkey: string }> {
	const data = (await ok(
		rpc.post('com.atproto.repo.createRecord', {
			input: { repo: did, collection: COLLECTION, record }
		})
	)) as { uri: string; cid?: string };
	return { uri: data.uri, rkey: data.uri.split('/').pop()! };
}

console.log('publishing conference event…');
const conference = await createEvent({
	$type: COLLECTION,
	createdAt: nowIso,
	name: 'Test Conference 2026',
	description: 'A throwaway conference to preview the timetable feature.',
	startsAt: at(0),
	endsAt: at(8 * 60),
	timezone: TZ,
	additionalData: { type: 'conference', rooms: [ROOM_MAIN, ROOM_WORKSHOP] }
});
console.log(`  conference: ${conference.uri}`);

type TalkSpec = {
	name: string;
	description: string;
	type: string;
	room?: string;
	start: number;
	end: number;
	speakers?: { name: string }[];
};

const talks: TalkSpec[] = [
	{
		name: 'Opening Keynote',
		description: 'Welcome and the year ahead.',
		type: 'talk',
		room: ROOM_MAIN,
		start: 0,
		end: 45,
		speakers: [{ name: 'Ada Lovelace' }]
	},
	{
		name: 'Hands-on Workshop: Building on atproto',
		description: 'Bring a laptop.',
		type: 'workshop',
		room: ROOM_WORKSHOP,
		start: 60,
		end: 150,
		speakers: [{ name: 'Grace Hopper' }]
	},
	{
		name: 'Lightning Talks',
		description: 'Five-minute talks, back to back.',
		type: 'lightning-talk',
		room: ROOM_MAIN,
		start: 60,
		end: 90,
		speakers: [{ name: 'Various' }]
	},
	{
		name: 'Panel: The Open Social Web',
		description: 'A wide-ranging discussion.',
		type: 'panel',
		room: ROOM_MAIN,
		start: 100,
		end: 150,
		speakers: [{ name: 'Alan Turing' }, { name: 'Katherine Johnson' }]
	},
	{
		name: 'Lunch',
		description: '',
		type: 'info',
		room: 'none',
		start: 150,
		end: 195
	},
	{
		name: 'Closing Remarks',
		description: 'See you next year.',
		type: 'talk',
		room: ROOM_MAIN,
		start: 200,
		end: 240,
		speakers: [{ name: 'Ada Lovelace' }]
	}
];

console.log(`publishing ${talks.length} talks…`);
const talkUris: string[] = [];
for (const t of talks) {
	const { uri } = await createEvent({
		$type: COLLECTION,
		createdAt: nowIso,
		name: t.name,
		description: t.description,
		startsAt: at(t.start),
		endsAt: at(t.end),
		timezone: TZ,
		additionalData: {
			type: t.type,
			parentEvent: { uri: conference.uri },
			...(t.room ? { room: t.room } : {}),
			...(t.speakers ? { speakers: t.speakers } : {})
		}
	});
	talkUris.push(uri);
	console.log(`  ${t.name} → ${uri}`);
}

// ---- Ask the app to index everything now ------------------------------------

const allUris = [conference.uri, ...talkUris];
try {
	const res = await fetch(`${APP_URL}/xrpc/rsvp.atmo.notifyOfUpdate`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ uris: allUris })
	});
	console.log(`\nnotified ${APP_URL} to index ${allUris.length} records (status ${res.status})`);
} catch (err) {
	console.log(
		`\ncould not reach ${APP_URL} to trigger indexing (${(err as Error).message}). ` +
			'They should be picked up by the indexer shortly anyway.'
	);
}

console.log('\n' + '='.repeat(60));
console.log('done. view the conference timetable at:');
console.log(`  ${APP_URL}/p/${did}/e/${conference.rkey}`);
console.log('='.repeat(60));

process.exit(0);
