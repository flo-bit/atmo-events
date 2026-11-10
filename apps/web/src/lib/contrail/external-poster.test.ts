import { expect, it } from 'vitest';
import { Client } from '@atcute/client';
import { Contrail, createIngestEvent, ingestRecords } from '@atmo-dev/contrail';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { getEventExternalImage } from '@atmo-dev/kit/events-data';
import { config } from '../contrail.config';
import {
	flattenEventRecord,
	flattenEventRecords,
	getEventRecordFromContrail,
	listEventRecordsFromContrail
} from '../contrail';

it('preserves laugh.town image extensions through indexing, queries and flattening', async () => {
	const did = 'did:plc:k6owgpe2rkkchoiivxhzp2t4';
	const url = 'https://laugh.town/cdn/p/posters/47fee09eaa4c3fab.webp';
	const poster = { url, width: 600, height: 600 };
	const db = createSqliteDatabase(':memory:');
	const contrail = new Contrail({ ...config, profiles: [] });
	await contrail.init(db);
	await ingestRecords(
		db,
		[
			createIngestEvent({
				did,
				collection: 'community.lexicon.calendar.event',
				rkey: '3mpeyybund2ib',
				cid: 'cid',
				operation: 'create',
				timeUs: 1,
				value: {
					$type: 'community.lexicon.calendar.event',
					name: 'Comedy Writing Workshop Series (18+)',
					createdAt: '2026-06-10T06:49:33.074Z',
					startsAt: '2026-11-05T17:30:00-06:00',
					poster,
					uris: [{ uri: url, name: 'Event Image', source: 'town.laugh' }]
				}
			})
		],
		contrail.config
	);
	const handler = contrail.handler({ db });
	const client = new Client({
		handler: (path, init) => handler(new Request(new URL(path, 'http://localhost'), init))
	});
	const record = await getEventRecordFromContrail(client, { did, rkey: '3mpeyybund2ib' });
	const event = record && flattenEventRecord(record);
	expect(event?.poster).toEqual(poster);
	expect(event && getEventExternalImage(event)?.url).toBe(url);
	const list = await listEventRecordsFromContrail(client, {});
	const events = flattenEventRecords(list?.records ?? []);
	expect(events[0]?.poster).toEqual(poster);
	expect(getEventExternalImage(events[0])?.url).toBe(url);
});
