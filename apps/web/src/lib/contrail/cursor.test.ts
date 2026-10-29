import { describe, expect, it } from 'vitest';
import { CURSOR_QUERIES, decodeCursor, encodeCursor, nextCursor, rawForQuery } from './cursor';
const encode = (value: unknown) =>
	btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('query-bound continuation cursors', () => {
	it.each(CURSOR_QUERIES)('round trips %s without interpreting its raw keyset', (q) => {
		const envelope = {
			v: 1 as const,
			q,
			raw: 'opaque-keyset',
			args: { actor: 'example.test', popular: false }
		};
		expect(decodeCursor(encodeCursor(envelope))).toEqual(envelope);
	});
	it('preserves Unicode scope args', () => {
		expect(decodeCursor(nextCursor('topic', 'k', { slug: '音楽' }))?.args).toEqual({
			slug: '音楽'
		});
	});
	it.each([null, undefined, ''])('does not manufacture a continuation from %s', (raw) => {
		expect(nextCursor('events', raw)).toBeNull();
	});
	it.each([
		null,
		undefined,
		'',
		'meili:20',
		'd1:key',
		'not-json',
		'a'.repeat(1600),
		encode(null),
		encode([]),
		encode({ v: 2, q: 'events', raw: 'k' }),
		encode({ v: 1, q: 'constructor', raw: 'k' }),
		encode({ v: 1, q: 'plain', raw: 'k' }),
		encode({ v: 1, q: 'search-meili', raw: 'meili:20' }),
		encode({ v: 1, q: 'happening-now-meili', raw: 'meili:20' }),
		encode({ v: 1, q: 'events', raw: '' }),
		encode({ v: 1, q: 'events', raw: 1 }),
		encode({ v: 1, q: 'events', raw: 'k', args: { popular: 'true' } }),
		encode({ v: 1, q: 'events', raw: 'k', args: [] })
	])('rejects malformed or removed cursors: %s', (token) => {
		expect(decodeCursor(token)).toBeNull();
	});
	it('only deep-links the same query and same public scope', () => {
		const token = nextCursor('topic', 'key', { slug: 'ai' });
		expect(rawForQuery(token, 'topic', { slug: 'ai' })).toBe('key');
		expect(rawForQuery(token, 'topic', { slug: 'technology' })).toBeUndefined();
		expect(rawForQuery(token, 'events')).toBeUndefined();
		expect(rawForQuery(token, 'topic')).toBeUndefined();
	});
	it('cannot validate an inbound free-text cursor without its term', () => {
		expect(rawForQuery(nextCursor('search-d1', 'key'), 'search-d1')).toBeUndefined();
	});
});
