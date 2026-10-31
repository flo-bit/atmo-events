import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from '@atmo-dev/contrail';
import { getProfileCounts } from './profile-counts';

const did = 'did:plc:alice';
const databases: DatabaseSync[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});

function setup() {
	const sqlite = new DatabaseSync(':memory:');
	databases.push(sqlite);
	sqlite.exec(`
		CREATE TABLE records_event (uri TEXT PRIMARY KEY, did TEXT, cid TEXT DEFAULT 'cid', record TEXT);
		CREATE TABLE records_rsvp (uri TEXT PRIMARY KEY, did TEXT, cid TEXT DEFAULT 'cid', record TEXT);
		CREATE TABLE moderation_hidden (subject TEXT, cid TEXT, starts_at INTEGER, exp INTEGER);
	`);
	const db = {
		prepare: (sql: string) => ({
			bind: (...args: SQLInputValue[]) => ({ first: async () => sqlite.prepare(sql).get(...args) })
		})
	} as unknown as Database;
	function event(key: string, author = did, parent?: string) {
		const uri = `at://${author}/community.lexicon.calendar.event/${key}`;
		sqlite
			.prepare('INSERT INTO records_event (uri, did, record) VALUES (?, ?, ?)')
			.run(
				uri,
				author,
				JSON.stringify({ additionalData: parent ? { parentEvent: { uri: parent } } : undefined })
			);
		return uri;
	}
	let i = 0;
	function rsvp(uri: string, status = 'going', author = did) {
		const rsvpUri = `at://${author}/community.lexicon.calendar.rsvp/${++i}`;
		sqlite
			.prepare('INSERT INTO records_rsvp (uri, did, record) VALUES (?, ?, ?)')
			.run(
				rsvpUri,
				author,
				JSON.stringify({ subject: { uri }, status: `community.lexicon.calendar.rsvp#${status}` })
			);
		return rsvpUri;
	}
	const hide = (subject: string) =>
		sqlite.prepare("INSERT INTO moderation_hidden (subject, cid) VALUES (?, '')").run(subject);
	return { db, event, rsvp, hide };
}

describe('profile event totals', () => {
	it('counts all-time events beyond preview/page limits, excluding conference talks', async () => {
		const { db, event } = setup();
		for (let i = 0; i < 130; i++) event(String(i));
		event('talk', did, 'at://conference');
		event('other', 'did:plc:other');
		expect(await getProfileCounts(db, did)).toEqual({ created: 130, rsvpd: 0 });
	});

	it('counts distinct going/interested events, excluding declined, missing, and other actors’ RSVPs', async () => {
		const { db, event, rsvp } = setup();
		const one = event('one');
		const two = event('two', 'did:plc:other');
		rsvp(one);
		rsvp(one, 'interested');
		rsvp(two, 'interested');
		rsvp(event('declined'), 'notgoing');
		rsvp('at://missing');
		rsvp(event('another-viewer'), 'going', 'did:plc:other');
		expect(await getProfileCounts(db, did)).toEqual({ created: 3, rsvpd: 2 });
	});

	it('enforces visibility for created events, RSVP records and referenced event authors', async () => {
		const { db, event, rsvp, hide } = setup();
		rsvp(event('visible'));
		const hiddenEvent = event('hidden');
		rsvp(hiddenEvent);
		hide(hiddenEvent);
		hide(rsvp(event('hidden-rsvp')));
		rsvp(event('hidden-author', 'did:plc:hidden'));
		hide('did:plc:hidden');
		expect(await getProfileCounts(db, did)).toEqual({ created: 2, rsvpd: 1 });
		hide(did);
		expect(await getProfileCounts(db, did)).toEqual({ created: 0, rsvpd: 0 });
	});

	it('omits unavailable counts rather than pretending they are zero', async () => {
		const { db } = setup();
		expect(await getProfileCounts(db, did)).toEqual({ created: 0, rsvpd: 0 });
		expect(
			await getProfileCounts(
				{
					prepare() {
						throw new Error('unavailable');
					}
				} as unknown as Database,
				did
			)
		).toBeUndefined();
	});
});
