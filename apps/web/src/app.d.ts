// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: OAuthSession | null;
			client: Client | null;
			did: Did | null;
		}
		interface PageData {
			atTags?: import('@atmo-dev/kit/at-tags').AtTagMetadata;
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
			OG_DAILY_NEW_EVENT_RESERVE?: string;
			OG_CYCLE_GENERATION_LIMIT?: string;
			OG_BILLING_CYCLE_START_DAY?: string;
			CRON_SECRET: string;
			/** 'true' offers private events: spaces on each person's own PDS, read directly. */
			PRIVATE_EVENTS?: string;
			/** A PDS with spaces support, to point people at when theirs can't do private events. */
			SPACES_PDS_URL?: string;
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
