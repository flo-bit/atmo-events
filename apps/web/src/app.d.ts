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
				/** Handle or DID of the reply bot, e.g. `going.atmo.rsvp`. */
				BOT_IDENTIFIER?: string;
				/** App password for the bot account (set via `wrangler secret put`). */
				BOT_APP_PASSWORD?: string;
				/** PDS the bot authenticates against; defaults to bsky.social. */
				BOT_PDS_URL?: string;
				/** P-256 private key (multikey) used to sign atmo.pub app tokens and
				 *  publish the `did:web` DID document. Set via `wrangler secret put`.
				 *  When unset, notifications are disabled (the feature no-ops). */
				ATMO_NOTIFY_PRIVATE_KEY?: string;
				/** Meilisearch base url for the search read path (search/near-me).
				 *  When either var is unset, search falls back to the D1 path and
				 *  near-me is unavailable. */
				SEARCH_URL?: string;
				/** Read-only Default Search API Key (set via `wrangler secret put`).
				 *  Never the admin or root key. */
				SEARCH_API_KEY?: string;
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
