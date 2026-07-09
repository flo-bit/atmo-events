import { describe, it, expect } from 'vitest';
import {
	tagCursor,
	parseCursor,
	encodeCursor,
	decodeCursor,
	nextCursor,
	rawForQuery,
	type CursorEnvelope
} from './cursor';

/**
 * Hand-craft a base64url(JSON) token from ARBITRARY (including type-invalid /
 * hostile) content, bypassing encodeCursor's type gate — this is how an attacker
 * would forge a cursor. Uses Node's base64url encoding, which matches the
 * production btoa-based encoder byte-for-byte for these payloads.
 */
function craft(obj: unknown): string {
	return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

// A pagination cursor handed to the client is tagged with the backend that
// issued it so load-more can route by the tag instead of re-deriving the
// backend from request shape. These pin the tag round-trip and the legacy
// (untagged) fallback contract both cursor kinds share.
describe('tagCursor', () => {
	it('prefixes a Meili offset with its backend tag', () => {
		expect(tagCursor('meili', '20')).toBe('meili:20');
	});

	it('prefixes an opaque D1 base64url keyset with its backend tag', () => {
		// A real D1 cursor is base64url(JSON) — no ':' in the alphabet, so the
		// first ':' is unambiguously the tag separator.
		const d1 = 'eyJ0IjoxNzUsImsiOiJhdDovL3gifQ';
		expect(tagCursor('d1', d1)).toBe(`d1:${d1}`);
	});

	it('returns null for a null/empty raw cursor (no more pages)', () => {
		expect(tagCursor('meili', null)).toBeNull();
		expect(tagCursor('d1', undefined)).toBeNull();
		expect(tagCursor('d1', '')).toBeNull();
	});
});

describe('parseCursor', () => {
	it('round-trips a Meili-tagged cursor back to {backend, raw}', () => {
		expect(parseCursor(tagCursor('meili', '20'))).toEqual({ backend: 'meili', raw: '20' });
	});

	it('round-trips a D1-tagged cursor back to {backend, raw}', () => {
		const d1 = 'eyJ0IjoxNzUsImsiOiJhdDovL3gifQ';
		expect(parseCursor(tagCursor('d1', d1))).toEqual({ backend: 'd1', raw: d1 });
	});

	it('treats a null/empty cursor as no cursor', () => {
		expect(parseCursor(null)).toEqual({ backend: null, raw: null });
		expect(parseCursor(undefined)).toEqual({ backend: null, raw: null });
		expect(parseCursor('')).toEqual({ backend: null, raw: null });
	});

	it('treats an untagged legacy Meili offset as backend:null with raw preserved', () => {
		// In-flight cursor issued before this deploy: no recognized tag, so the
		// caller falls back to the old inference and can still consume raw.
		expect(parseCursor('20')).toEqual({ backend: null, raw: '20' });
	});

	it('treats an untagged legacy D1 base64url keyset as backend:null with raw preserved', () => {
		const d1 = 'eyJ0IjoxNzUsImsiOiJhdDovL3gifQ';
		expect(parseCursor(d1)).toEqual({ backend: null, raw: d1 });
	});

	it('does not mistake an unknown prefix for a backend tag', () => {
		// Only 'meili'/'d1' are backends; anything else is legacy/opaque and kept whole.
		expect(parseCursor('foo:bar')).toEqual({ backend: null, raw: 'foo:bar' });
	});
});

// The client continuation cursor is now a self-describing envelope:
// base64url(JSON { v, q, args?, raw }). It names a SERVER-SIDE query; the server
// re-runs that query with its own filter values, so the client carries no
// pipeline/filters and a tampered token can only name another public-safe query
// or fail to decode. These pin the round-trip, the never-throw decode guard, and
// the deep-link query-match rule.
describe('encodeCursor / decodeCursor round-trip', () => {
	it('round-trips every field (q + args + raw)', () => {
		const envelope: CursorEnvelope = {
			v: 1,
			q: 'hosting',
			args: { actor: 'did:plc:alice' },
			raw: 'eyJ0IjoxNzUsImsiOiJhdDovL3gifQ'
		};
		expect(decodeCursor(encodeCursor(envelope))).toEqual(envelope);
	});

	it('round-trips an argless envelope', () => {
		const envelope: CursorEnvelope = { v: 1, q: 'search-d1', raw: 'keyset' };
		expect(decodeCursor(encodeCursor(envelope))).toEqual(envelope);
	});

	it('round-trips the popular boolean arg', () => {
		const envelope: CursorEnvelope = { v: 1, q: 'events', args: { popular: true }, raw: 'k' };
		expect(decodeCursor(encodeCursor(envelope))).toEqual(envelope);
	});

	it('emits base64url only — no + / or = padding', () => {
		const token = encodeCursor({ v: 1, q: 'topic', args: { slug: 'ai' }, raw: 'a+b/c==dd' });
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(token).not.toMatch(/[+/=]/);
	});
});

describe('decodeCursor fail-safe (never throws, returns null on anything bad)', () => {
	it('returns null for null/undefined/empty', () => {
		expect(decodeCursor(null)).toBeNull();
		expect(decodeCursor(undefined)).toBeNull();
		expect(decodeCursor('')).toBeNull();
	});

	it('returns null for legacy tagged cursors (contain ":", not base64url)', () => {
		// Deploy-straddle: a meili:/d1: cursor issued by the previous deploy arrives
		// at the new load-more. It must fail-safe to null (end pagination), never be
		// resurrected into a query.
		expect(decodeCursor('meili:20')).toBeNull();
		expect(decodeCursor('d1:eyJ0IjoxNzUsImsiOiJhdDovL3gifQ')).toBeNull();
	});

	it('returns null for a bare legacy offset (valid base64url chars, not JSON)', () => {
		// '20' is base64url-shaped but decodes to bytes that are not JSON.
		expect(decodeCursor('20')).toBeNull();
	});

	it('returns null for base64url of non-JSON bytes', () => {
		expect(decodeCursor(Buffer.from('not json', 'utf-8').toString('base64url'))).toBeNull();
	});

	it('returns null for non-base64url characters', () => {
		expect(decodeCursor('has spaces')).toBeNull();
		expect(decodeCursor('{"v":1}')).toBeNull();
	});

	it('returns null for a JSON array (not an object)', () => {
		expect(decodeCursor(craft([1, 2, 3]))).toBeNull();
	});

	it('returns null for a wrong/absent version', () => {
		expect(decodeCursor(craft({ v: 2, q: 'events', raw: 'x' }))).toBeNull();
		expect(decodeCursor(craft({ q: 'events', raw: 'x' }))).toBeNull();
	});

	it('returns null for an unknown query name', () => {
		expect(decodeCursor(craft({ v: 1, q: 'plain', raw: 'x' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: 'listRecords', raw: 'x' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: '', raw: 'x' }))).toBeNull();
	});

	it('returns null for a missing/empty/non-string raw', () => {
		expect(decodeCursor(craft({ v: 1, q: 'events' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: 'events', raw: '' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: 'events', raw: 123 }))).toBeNull();
	});

	it('returns null for mistyped args', () => {
		expect(decodeCursor(craft({ v: 1, q: 'events', args: 'nope', raw: 'x' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: 'events', args: { popular: 'yes' }, raw: 'x' }))).toBeNull();
		expect(decodeCursor(craft({ v: 1, q: 'hosting', args: { actor: 42 }, raw: 'x' }))).toBeNull();
	});

	it('returns null for an oversized token (> ~1500 chars)', () => {
		const huge = encodeCursor({ v: 1, q: 'events', raw: 'x'.repeat(4000) });
		expect(huge.length).toBeGreaterThan(1500);
		expect(decodeCursor(huge)).toBeNull();
	});

	it('ignores unknown extra fields in args, keeping only allow-listed ones', () => {
		const token = craft({ v: 1, q: 'events', args: { popular: true, evil: 'x' }, raw: 'k' });
		expect(decodeCursor(token)).toEqual({ v: 1, q: 'events', args: { popular: true }, raw: 'k' });
	});
});

describe('nextCursor', () => {
	it('returns null when the backend signalled no more pages (null/empty raw)', () => {
		expect(nextCursor('events', null)).toBeNull();
		expect(nextCursor('events', undefined)).toBeNull();
		expect(nextCursor('events', '')).toBeNull();
	});

	it('builds a decodable same-query envelope from a fresh raw keyset', () => {
		const token = nextCursor('hosting', 'newkeyset', { actor: 'did:plc:alice' });
		expect(decodeCursor(token)).toEqual({
			v: 1,
			q: 'hosting',
			args: { actor: 'did:plc:alice' },
			raw: 'newkeyset'
		});
	});

	it('omits an empty args object so identical continuations round-trip identically', () => {
		expect(decodeCursor(nextCursor('search-d1', 'k', {}))).toEqual({
			v: 1,
			q: 'search-d1',
			raw: 'k'
		});
	});
});

describe('rawForQuery (deep-link guard)', () => {
	it('returns the raw when the envelope names the requested query AND same args', () => {
		const token = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'k1' });
		expect(rawForQuery(token, 'events', { popular: true })).toBe('k1');
	});

	it('returns undefined when the envelope names a DIFFERENT query (cross-route keyset)', () => {
		// A desc past-events keyset deep-linked into the asc events route must NOT
		// resume — the route falls back to a fresh page 1.
		const token = encodeCursor({ v: 1, q: 'past-events', args: { actor: 'did:plc:a' }, raw: 'k' });
		expect(rawForQuery(token, 'events', { popular: true })).toBeUndefined();
	});

	it('returns undefined on an ARGS mismatch even when the query matches', () => {
		// Same `q`, different scope = a keyset for a different result set. Each of
		// these would skip/duplicate rows if resumed, so the guard rejects them.
		const topicTech = encodeCursor({ v: 1, q: 'topic', args: { slug: 'technology' }, raw: 'k' });
		expect(rawForQuery(topicTech, 'topic', { slug: 'ai' })).toBeUndefined();
		expect(rawForQuery(topicTech, 'topic', { slug: 'technology' })).toBe('k');

		const actorA = encodeCursor({ v: 1, q: 'hosting', args: { actor: 'did:plc:a' }, raw: 'k' });
		expect(rawForQuery(actorA, 'hosting', { actor: 'did:plc:b' })).toBeUndefined();
		expect(rawForQuery(actorA, 'hosting', { actor: 'did:plc:a' })).toBe('k');

		// popular vs all: a rsvpsCountMin>=2 keyset must not resume the unfiltered list.
		const popular = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'k' });
		expect(rawForQuery(popular, 'events', { popular: false })).toBeUndefined();
	});

	it('refuses to resume term-carrying search queries (term not in the envelope)', () => {
		// The search term rides ?q=, not the envelope, so a search cursor can't be
		// proven to match the route's term — never resume it from a deep link.
		const d1 = encodeCursor({ v: 1, q: 'search-d1', raw: 'k' });
		const meili = encodeCursor({ v: 1, q: 'search-meili', raw: 'meili:20' });
		expect(rawForQuery(d1, 'search-d1')).toBeUndefined();
		expect(rawForQuery(meili, 'search-meili')).toBeUndefined();
	});

	it('returns undefined for an undecodable / legacy token', () => {
		expect(rawForQuery('meili:20', 'search-meili')).toBeUndefined();
		expect(rawForQuery(null, 'events')).toBeUndefined();
		expect(rawForQuery('garbage', 'events')).toBeUndefined();
	});
});
