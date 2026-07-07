import { describe, it, expect } from 'vitest';
import { tagCursor, parseCursor } from './cursor';

// A pagination cursor handed to the client is tagged with the backend that
// issued it so load-more can route by the tag instead of re-deriving the
// backend from request shape (om-7dbs). These pin the tag round-trip and the
// legacy (untagged) fallback contract both cursor kinds share.
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
