import '@atcute/atproto';
import { dev } from '$app/env';
import { env } from 'cloudflare:workers';
import type { Client } from '@atcute/client';
import { isCanonicalResourceUri, type ResourceUri } from '@atcute/lexicons';
import { visibleRecordSql } from '@atmo-dev/contrail';
import { hasScopes } from '@svelte-atproto/oauth/permissions';
import { FOR_YOU_AUDIENCE, FOR_YOU_METHOD, FOR_YOU_SCOPE } from '#lib/atproto/recommendations.js';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { ensureInit, getServerClient } from '#lib/contrail/index.js';
import { discoverableSql } from '#lib/contrail/discoverability.js';
import { flattenEventRecord, type FlatEventRecord } from '#lib/contrail.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 4000;
const COLLECTION = 'community.lexicon.calendar.event';
const LIMIT = 100;
const DISPLAY_LIMIT = 6;
const ready = new WeakMap<D1Database, Promise<void>>();

function ensureSchema(db: D1Database): Promise<void> {
	let init = ready.get(db);
	if (!init) {
		init = db
			.prepare(
				`CREATE TABLE IF NOT EXISTS for_you_cache (
				did TEXT PRIMARY KEY,
				uris TEXT NOT NULL DEFAULT '[]',
				refresh_after INTEGER NOT NULL DEFAULT 0,
				lease_token TEXT
			)`
			)
			.run()
			.then(() => {})
			.catch((error) => {
				ready.delete(db);
				throw error;
			});
		ready.set(db, init);
	}
	return init;
}

/** Accept only bounded, DID-based event URIs. Never persist JWTs or feedContext. */
export function eventUris(value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error('Invalid recommendation feed');
	const uris = value.slice(0, LIMIT).flatMap((item: unknown) => {
		const uri = typeof item === 'object' && item !== null && 'record' in item ? item.record : null;
		return typeof uri === 'string' &&
			uri.length <= 2048 &&
			isCanonicalResourceUri(uri) &&
			/^at:\/\/did:(?:plc|web):[^/?#\s]+\/community\.lexicon\.calendar\.event\/[a-zA-Z0-9._~:-]+$/.test(
				uri
			)
			? [uri]
			: [];
	});
	return [...new Set(uris)];
}

/** Private daily cache with atomic per-viewer refresh deduplication across Workers.
 * Empty successes last a day; failed or crashed refreshes back off for an hour.
 * Different viewers may refresh concurrently; there is no global QPS limiter. */
export async function readRecommendationUris(
	db: D1Database,
	did: string,
	client: Client,
	fetchImpl: typeof fetch = fetch
): Promise<string[]> {
	await ensureSchema(db);
	// D1 read replicas must not serve stale cache/refresh reads.
	const store = db.withSession('first-primary');
	const now = Date.now();
	const row = await store
		.prepare('SELECT uris, refresh_after FROM for_you_cache WHERE did = ?')
		.bind(did)
		.first<{ uris: string; refresh_after: number }>();
	const stale = row ? eventUris(JSON.parse(row.uris).map((record: string) => ({ record }))) : [];
	if (row && row.refresh_after > now) return stale;

	const token = crypto.randomUUID();
	const claim = await store
		.prepare(
			`INSERT INTO for_you_cache (did, refresh_after, lease_token)
		VALUES (?, ?, ?) ON CONFLICT(did) DO UPDATE SET
		refresh_after = excluded.refresh_after, lease_token = excluded.lease_token
		WHERE for_you_cache.refresh_after <= ?`
		)
		.bind(did, now + FAILURE_BACKOFF_MS, token, now)
		.run();
	if (!claim.meta.changes) return stale;

	try {
		// PDS OAuth credentials are never forwarded to For You. Only this short-lived,
		// audience- and method-bound service JWT leaves the server.
		const auth = await client.get('com.atproto.server.getServiceAuth', {
			params: {
				aud: FOR_YOU_AUDIENCE,
				lxm: FOR_YOU_METHOD,
				exp: Math.floor(Date.now() / 1000) + 60
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!auth.ok) return stale;
		const url = new URL(`/xrpc/${FOR_YOU_METHOD}`, 'https://foryou.club');
		url.searchParams.set('nsid', COLLECTION);
		url.searchParams.set('limit', String(LIMIT));
		const response = await fetchImpl(url, {
			headers: { Authorization: `Bearer ${auth.data.token}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
			redirect: 'error'
		});
		if (!response.ok) return stale;
		const body: unknown = await response.json();
		const uris = eventUris(
			typeof body === 'object' && body !== null && 'feed' in body ? body.feed : null
		);
		await store
			.prepare(
				'UPDATE for_you_cache SET uris = ?, refresh_after = ? WHERE did = ? AND lease_token = ?'
			)
			.bind(JSON.stringify(uris), Date.now() + DAY_MS, did, token)
			.run();
		return uris;
	} catch {
		// No JWTs, response bodies or viewer identifiers in logs. Preserve old ranks.
		console.warn('[for-you] refresh unavailable');
		return stale;
	}
}

/** Re-check current visibility and dates on every read; the daily cache contains
 * ranking only, never an event snapshot that could outlive a hide or deletion. */
export async function hydrateRecommendations(
	db: D1Database,
	uris: string[]
): Promise<FlatEventRecord[]> {
	if (!uris.length) return [];
	await ensureInit(db);
	const now = new Date().toISOString();
	const eligible = await db
		.prepare(
			`SELECT r.uri FROM records_event r
		WHERE r.uri IN (SELECT value FROM json_each(?))
		AND ${discoverableSql('r.record')} AND ${visibleRecordSql('r')}
		AND (json_extract(r.record, '$.startsAt') >= ? OR json_extract(r.record, '$.endsAt') >= ?)`
		)
		.bind(JSON.stringify(uris), now, now)
		.all<{ uri: string }>();
	const visible = new Set(eligible.results.map(({ uri }) => uri));
	const client = getServerClient(db);
	const events = await Promise.all(
		uris
			.filter((uri) => visible.has(uri))
			.slice(0, DISPLAY_LIMIT)
			.map(async (uri) => {
				const response = await client.get('rsvp.atmo.event.getRecord', {
					params: { uri: uri as ResourceUri, hydrateRsvps: 5 }
				});
				return response.ok ? flattenEventRecord(response.data) : null;
			})
	);
	return events.filter((event): event is FlatEventRecord => event !== null);
}

export async function getRecommendedEvents(locals: App.Locals): Promise<FlatEventRecord[]> {
	// Explicit opt-in allows testing against the public recommender from local dev,
	// without accidentally sending private-testnet identities there. False is also
	// a production kill switch; an unset value keeps production enabled.
	const enabled = env.FOR_YOU_ENABLED === 'true' || (!dev && env.FOR_YOU_ENABLED === undefined);
	if (!enabled || !locals.did || !locals.client) return [];
	try {
		// Check the actual grant. The current library's RPC capability checker
		// requires a DID#service audience, while For You uses a bare DID.
		const permissions = await getAuth().api.getPermissions();
		if (!hasScopes(permissions.grantedScope, FOR_YOU_SCOPE)) return [];
		// Stable private storage, separate from the rebuildable public index. Missing
		// storage fails closed: never fall back to uncached recommendation requests.
		const db = env.RECOMMENDATIONS_DB;
		if (!db || db === env.DB || db === env.REPORTS_DB) return [];
		const uris = await readRecommendationUris(db, locals.did, locals.client);
		return await hydrateRecommendations(env.DB, uris);
	} catch {
		console.warn('[for-you] recommendations unavailable');
		return [];
	}
}
