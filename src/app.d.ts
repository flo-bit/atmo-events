// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

interface AtmoEmbedSDK {
	getParams(): { base: string; accent: string; dark: boolean; did: string | null };
	createRecord(opts: {
		collection: string;
		rkey?: string;
		record: Record<string, unknown>;
	}): Promise<{ uri: string }>;
	deleteRecord(opts: { collection: string; rkey: string }): Promise<void>;
}

declare global {
	interface Window {
		AtmoEmbed?: AtmoEmbedSDK;
	}
	namespace App {
		// interface Error {}
		interface Locals {
			session: OAuthSession | null;
			client: Client | null;
			did: Did | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				OAUTH_SESSIONS: KVNamespace;
				OAUTH_STATES: KVNamespace;
				CLIENT_ASSERTION_KEY: string;
				COOKIE_SECRET: string;
				OAUTH_PUBLIC_URL: string;
				DB: D1Database;
				CRON_SECRET: string;
			};
			/** Cloudflare Worker execution context. Use `ctx.waitUntil(promise)` to
			 *  let the worker keep a fire-and-forget task alive after the response
			 *  has been sent. Optional in dev (wrangler proxy may not provide it). */
			ctx?: { waitUntil(promise: Promise<unknown>): void };
		}
	}
}
import type {} from '@atcute/atproto';
import type {} from '@atcute/bluesky';

export {};
