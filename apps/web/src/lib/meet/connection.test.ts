import { describe, expect, it } from 'vitest';
import {
	CONNECTION_COLLECTION,
	connectionRecord,
	meetingsFor,
	parseMeetingCode,
	type Connection
} from './connection';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const origin = 'https://atmo.rsvp';
function record(owner: string, subject: string, key = 'one'): Connection {
	return {
		uri: `at://${owner}/${CONNECTION_COLLECTION}/${key}`,
		owner,
		subject,
		createdAt: '2026-10-31T12:00:00.000Z'
	};
}

describe('meeting QR compatibility', () => {
	it.each([
		bob,
		`https://atmo.rsvp/tools/meet?did=${encodeURIComponent(bob)}`,
		`https://youandme.at/connect?did=${bob}`
	])('accepts %s', (code) => {
		expect(parseMeetingCode(code, origin)).toBe(bob);
	});
	it.each([
		'https://evil.test/connect?did=' + bob,
		'https://youandme.at.evil.test/connect?did=' + bob,
		'https://youandme.at/other?did=' + bob,
		'javascript:alert(1)',
		'https://atmo.rsvp/tools/meet?did=alice',
		'https://user:pass@youandme.at/connect?did=' + bob,
		'',
		'alice',
		'@did:plc:alice',
		'https://atmo.rsvp/tools/meet?actor=https://evil.test'
	])('rejects %s', (code) => {
		expect(parseMeetingCode(code, origin)).toBeNull();
	});
	it.each([
		'alice.bsky.social',
		' @Alice.Bsky.Social ',
		'https://atmo.rsvp/tools/meet?actor=alice.bsky.social'
	])('accepts and normalizes a handle: %s', (code) => {
		expect(parseMeetingCode(code, origin)).toBe('alice.bsky.social');
	});
	it('preserves the original date when confirming a historical meeting', () => {
		expect(connectionRecord(bob, '2025-04-03T12:34:56.123Z').createdAt).toBe(
			'2025-04-03T12:34:56.123Z'
		);
		expect(() => connectionRecord(bob, 'yesterday')).toThrow();
	});
	it('writes the interoperable schema, with no extra invitation or confirmation fields', () => {
		expect(connectionRecord(bob)).toEqual({
			$type: CONNECTION_COLLECTION,
			subject: bob,
			createdAt: expect.any(String)
		});
		expect(() => connectionRecord('not a did')).toThrow();
	});
});

describe('reciprocal meetings', () => {
	it('never treats an incoming record as consent to write an outgoing one', () => {
		expect(meetingsFor(alice, [record(bob, alice)])).toEqual([
			{ did: bob, outgoing: false, incoming: true, createdAt: '2026-10-31T12:00:00.000Z' }
		]);
	});
	it('deduplicates people, recognizes mutual records and ignores unrelated/self records', () => {
		expect(
			meetingsFor(alice, [
				record(alice, bob),
				record(alice, bob, 'two'),
				record(bob, alice),
				record(alice, alice),
				record(bob, bob)
			])
		).toEqual([
			{ did: bob, outgoing: true, incoming: true, createdAt: '2026-10-31T12:00:00.000Z' }
		]);
	});
	it('drops mutual status when the reciprocal record is removed', () => {
		expect(meetingsFor(alice, [record(alice, bob)])[0]).toMatchObject({
			outgoing: true,
			incoming: false
		});
	});
});
