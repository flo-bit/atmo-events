// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

interface BlentoSession {
	did: string;
	handle?: string;
	displayName?: string;
	avatar?: string;
}

interface BlentoBlobRef {
	$type: 'blob';
	ref: { $link: string };
	mimeType: string;
	size: number;
}

type BlentoWrite =
	| { $type: 'create'; collection: string; rkey?: string; value: Record<string, unknown> }
	| { $type: 'update'; collection: string; rkey: string; value: Record<string, unknown> }
	| { $type: 'delete'; collection: string; rkey: string };

interface Blento {
	ready: Promise<void>;
	getTheme(): { base: string | null; accent: string | null; dark: boolean };
	getSession(): BlentoSession | null;
	on(event: 'session', cb: (session: BlentoSession | null) => void): () => void;
	createRecord(opts: {
		collection: string;
		rkey?: string;
		record: Record<string, unknown>;
	}): Promise<{ uri: string; cid?: string }>;
	putRecord(opts: {
		collection: string;
		rkey: string;
		record: Record<string, unknown>;
	}): Promise<{ uri: string; cid?: string }>;
	deleteRecord(opts: { collection: string; rkey: string }): Promise<{ ok: boolean }>;
	applyWrites(opts: {
		writes: BlentoWrite[];
		validate?: boolean;
	}): Promise<{ results: Array<{ uri?: string; cid?: string }> }>;
	uploadBlob(blob: Blob, opts?: { mimeType?: string }): Promise<BlentoBlobRef>;
	notifyResize(heightPx: number): void;
	notifyNavigate(url: string): void;
	promptLogin(): void;
	notify(name: string, payload?: unknown): void;
}

declare global {
	interface Window {
		Blento?: Blento;
	}
	namespace App {
		// interface Error {}
		interface Locals {
			session: OAuthSession | null;
			client: Client | null;
			did: Did | null;
		}
		interface PageData {
			pageTitle?: string;
			pageDescription?: string;
			ogImage?: string;
			reportSubject?: import('./lib/moderation/reporting').ReportSubject;
		}
		// interface PageState {}
	}
	namespace Cloudflare {
		interface Env {
			OAUTH_SESSIONS: KVNamespace;
			OAUTH_STATES: KVNamespace;
			CLIENT_ASSERTION_KEY: string;
			COOKIE_SECRET: string;
			OAUTH_PUBLIC_URL: string;
			DB: D1Database;
			/** Stable private report storage; never swap with projection generations. */
			REPORTS_DB: D1Database;
			/** Comma-separated trusted moderator DIDs; empty grants nobody access. */
			MODERATOR_DIDS?: string;
			ASSETS?: Fetcher;
			OG_IMAGES?: R2Bucket;
			OG_DAILY_GENERATION_LIMIT?: string;
			OG_CYCLE_GENERATION_LIMIT?: string;
			OG_BILLING_CYCLE_START_DAY?: string;
			CRON_SECRET: string;
			/** Handle or DID of the reply bot, e.g. `going.atmo.rsvp`. */
			BOT_IDENTIFIER?: string;
			/** App password for the bot account (set via `wrangler secret put`). */
			BOT_APP_PASSWORD?: string;
			/** PDS the bot authenticates against; defaults to bsky.social. */
			BOT_PDS_URL?: string;
			/** Public starter-pack creation is limited per client IP, without a DB table. */
			STARTER_PACK_RATE_LIMITER?: RateLimit;
			/** Optional geocoder for event address entry/maps, not location search. */
			GEOCODER_URL?: string;
			/** Geocoder API key (LocationIQ), set via `wrangler secret put`. When
			 *  unset, the drip no-ops (it won't fall back to public Nominatim). */
			GEOCODER_KEY?: string;
			/** Optional User-Agent for geocoder requests. */
			GEOCODER_USER_AGENT?: string;
		}
	}
}
import type {} from '@atcute/atproto';
import type {} from '@atcute/bluesky';

export {};
