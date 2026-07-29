// Self-describing pagination cursors — the codec behind "load more".
//
// A page's continuation is an opaque ENVELOPE (below) that names the server-side
// query to resume; its `raw` payload is a backend-native cursor — a Meilisearch
// offset that tagCursor prefixes as `meili:<n>`, or an opaque base64url(JSON) D1
// keyset from @atmo-dev/contrail. tagCursor/parseCursor are that Meilisearch
// offset codec (also used by near-me); they WRAP the raw cursor, never rewrite
// it, and the `:` separator can't collide (base64url excludes ':', a Meili
// offset is decimal digits).
//
// See README → "Load-more pagination" for the model and the cross-backend bug
// that motivated it.

export type CursorBackend = 'meili' | 'd1';

const SEP = ':';
const BACKENDS: readonly CursorBackend[] = ['meili', 'd1'];

/**
 * Tag a backend-native cursor for the client. A null/empty raw cursor stays
 * null (the backend signalled "no more pages"); tagging must not manufacture a
 * cursor where there wasn't one.
 */
export function tagCursor(backend: CursorBackend, raw: string | null | undefined): string | null {
	if (raw == null || raw === '') return null;
	return `${backend}${SEP}${raw}`;
}

export type ParsedCursor =
	| { backend: CursorBackend; raw: string }
	| { backend: null; raw: string | null };

/**
 * Split a client cursor back into { backend, raw }.
 *
 * - A recognized `meili:`/`d1:` tag routes by that backend.
 * - `null`/empty -> { backend: null, raw: null } (no cursor).
 * - Anything else is an untagged legacy cursor (in-flight from before this
 *   deploy, or an unknown prefix): { backend: null, raw: <as-is> } so the caller
 *   can fall back to the old inference and still consume it.
 *
 * NOTE — two callers, one permanent and one temporary:
 *  - PERMANENT: the search/near-me offset path (parseOffsetCursor) splits the
 *    `meili:<n>` tag tagCursor emits. Not going away.
 *  - TEMPORARY: fail-safing pre-envelope cursors still in flight after a deploy.
 *    Nothing emits `d1:` anymore and the client continuation cursor is now the
 *    ENVELOPE below, so the `d1:`/untagged branches can be dropped once those
 *    legacy cursors have drained (tracked as a follow-up).
 */
export function parseCursor(cursor: string | null | undefined): ParsedCursor {
	if (cursor == null || cursor === '') return { backend: null, raw: null };
	const sep = cursor.indexOf(SEP);
	if (sep > 0) {
		const tag = cursor.slice(0, sep);
		if ((BACKENDS as readonly string[]).includes(tag)) {
			return { backend: tag as CursorBackend, raw: cursor.slice(sep + 1) };
		}
	}
	return { backend: null, raw: cursor };
}

// ---------------------------------------------------------------------------
// Continuation envelope — the self-describing token the client echoes back.
//
// A base64url(JSON { v, q, args?, raw }) blob naming the SERVER-SIDE query that
// produced the page (`q`) plus the opaque backend-native cursor to resume from
// (`raw`). Load-more re-runs that query server-side with its OWN filter values;
// the client carries no pipeline and no filters — only public-safe scope choices
// in `args`. The search TERM stays out of the envelope; it rides the ?q= URL
// param / remote input.
//
// See README → "Load-more pagination" for the full model + why a tampered token
// can't widen visibility.
// ---------------------------------------------------------------------------

/**
 * The server-side query that issued a page. The name implies the backend
 * (search-meili -> Meili offset; everything else -> a D1 keyset), so no separate
 * `backend` field is needed. Every value is a query whose result set is
 * public-safe: the unlisted-inclusive plain listRecords pipeline is deliberately
 * absent, so no decoded envelope can reach it.
 */
export const CURSOR_QUERIES = [
	'events',
	'happening-now',
	'happening-now-meili',
	'hosting',
	'past-events',
	'topic',
	'search-d1',
	'search-meili'
] as const;

export type CursorQuery = (typeof CURSOR_QUERIES)[number];

/** Allow-listed, public-safe scope choices the client may legitimately carry. */
export type CursorArgs = {
	/** Public profile scope (hosting / past-events). */
	actor?: string;
	/** Public topic slug (topic). */
	slug?: string;
	/** Public "popular" toggle (events). */
	popular?: boolean;
};

export type CursorEnvelope = {
	/** Schema version, for future migration. */
	v: 1;
	/** Names the server-side registry entry that resumes this page. */
	q: CursorQuery;
	/** Public-safe scope choices; omitted when empty. */
	args?: CursorArgs;
	/** Opaque backend-native cursor (D1 keyset, or a meili-tagged offset). */
	raw: string;
};

/**
 * Defensive upper bound on a decoded token's length. The real envelope is
 * ~150-250 chars; anything far larger is malformed or hostile, so we refuse to
 * decode it (end pagination) rather than parse an over-long URL/body.
 */
const MAX_CURSOR_LEN = 1500;

/** base64url alphabet only — no '+' '/' '=' padding, no other characters. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function encodeBase64Url(json: string): string {
	const bytes = new TextEncoder().encode(json);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(token: string): string {
	const padded = token + '='.repeat((4 - (token.length % 4)) % 4);
	const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

/** Drop undefined/mistyped entries; return undefined when nothing remains. */
function cleanArgs(args: CursorArgs): CursorArgs | undefined {
	const out: CursorArgs = {};
	if (typeof args.actor === 'string') out.actor = args.actor;
	if (typeof args.slug === 'string') out.slug = args.slug;
	if (typeof args.popular === 'boolean') out.popular = args.popular;
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Encode a continuation envelope into an opaque base64url(JSON) client token. */
export function encodeCursor(envelope: CursorEnvelope): string {
	return encodeBase64Url(JSON.stringify(envelope));
}

/**
 * Build the NEXT-page token, or null when the backend signalled no more pages.
 * `raw` null/empty => null (never manufacture a cursor). `args` is normalized so
 * identical continuations round-trip identically.
 */
export function nextCursor(
	q: CursorQuery,
	raw: string | null | undefined,
	args?: CursorArgs
): string | null {
	if (raw == null || raw === '') return null;
	const cleaned = args ? cleanArgs(args) : undefined;
	return encodeCursor({
		v: 1,
		q,
		...(cleaned ? { args: cleaned } : {}),
		raw
	});
}

/**
 * Decode a client token back into an envelope, or null on ANY problem — never
 * throws. Rejects: null/empty, non-base64url characters (this fails-safe every
 * legacy `meili:`/`d1:` tag, which contains ':'), oversized input,
 * non-JSON, non-object, wrong version, unknown/absent `q`, a non-string/empty
 * `raw`, or a mistyped `args`. The registry then treats a null decode as
 * end-of-pagination.
 */
export function decodeCursor(token: string | null | undefined): CursorEnvelope | null {
	if (token == null || token === '') return null;
	if (token.length > MAX_CURSOR_LEN) return null;
	if (!BASE64URL_RE.test(token)) return null;

	let json: string;
	try {
		json = decodeBase64Url(token);
	} catch {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const obj = parsed as Record<string, unknown>;

	if (obj.v !== 1) return null;
	if (typeof obj.q !== 'string' || !(CURSOR_QUERIES as readonly string[]).includes(obj.q))
		return null;
	if (typeof obj.raw !== 'string' || obj.raw === '') return null;

	let args: CursorArgs | undefined;
	if (obj.args !== undefined) {
		if (!obj.args || typeof obj.args !== 'object' || Array.isArray(obj.args)) return null;
		const a = obj.args as Record<string, unknown>;
		const built: CursorArgs = {};
		if (a.actor !== undefined) {
			if (typeof a.actor !== 'string') return null;
			built.actor = a.actor;
		}
		if (a.slug !== undefined) {
			if (typeof a.slug !== 'string') return null;
			built.slug = a.slug;
		}
		if (a.popular !== undefined) {
			if (typeof a.popular !== 'boolean') return null;
			built.popular = a.popular;
		}
		args = Object.keys(built).length > 0 ? built : undefined;
	}

	return {
		v: 1,
		q: obj.q as CursorQuery,
		...(args ? { args } : {}),
		raw: obj.raw
	};
}

/** Normalized deep-equal on the public-safe scope bag; absent === empty. */
function argsEqual(a: CursorArgs | undefined, b: CursorArgs | undefined): boolean {
	const x = a ? cleanArgs(a) : undefined;
	const y = b ? cleanArgs(b) : undefined;
	return x?.actor === y?.actor && x?.slug === y?.slug && x?.popular === y?.popular;
}

/**
 * Queries a deep-link `?cursor=` may resume: those whose full identity is
 * (`q` + `args`). Search is excluded — its defining term rides `?q=`, not the
 * envelope, so a search cursor can't be validated against the route.
 */
const DEEP_LINKABLE: readonly CursorQuery[] = [
	'events',
	'happening-now',
	'hosting',
	'past-events',
	'topic'
];

/**
 * Deep-link guard for a first-page load: return the inbound `?cursor=`'s opaque
 * raw ONLY when the envelope was minted for the SAME query — same `q` AND same
 * public-safe scope (`args`). A keyset is query-shape-specific, so a q-match
 * alone isn't enough: a `technology` topic keyset on `/topics/ai` names the same
 * `q` but indexes a different set, and resuming it would skip/duplicate rows. Any
 * mismatch, an undecodable token, or a non-DEEP_LINKABLE query => fresh page 1.
 */
export function rawForQuery(
	token: string | null | undefined,
	q: CursorQuery,
	args?: CursorArgs
): string | undefined {
	if (!(DEEP_LINKABLE as readonly string[]).includes(q)) return undefined;
	const envelope = decodeCursor(token);
	if (!envelope || envelope.q !== q) return undefined;
	if (!argsEqual(envelope.args, args)) return undefined;
	return envelope.raw;
}
