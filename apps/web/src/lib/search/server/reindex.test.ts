import { describe, it, expect } from 'vitest';
import { reindexEventsToSink, type ReindexDb } from './reindex';
import { EVENT_COLLECTION } from './meili-sink';

// A fake D1 that serves `rows` via LIMIT/OFFSET and records the bind args, so we
// can assert pagination without a real database.
function fakeDb(rows: Array<Record<string, unknown>>) {
	const binds: Array<{ limit: number; offset: number }> = [];
	const db: ReindexDb = {
		prepare() {
			return {
				bind(limit: unknown, offset: unknown) {
					const l = Number(limit);
					const o = Number(offset);
					binds.push({ limit: l, offset: o });
					return {
						async all() {
							return { results: rows.slice(o, o + l) };
						}
					};
				}
			};
		}
	};
	return { db, binds };
}

function recordingSink() {
	const batches: Array<{ records: Array<Record<string, unknown>>; ctx: { phase: string } }> = [];
	const sink = {
		async onRecords(records: Array<Record<string, unknown>>, ctx: { phase: string }) {
			batches.push({ records, ctx });
		}
	} as unknown as Parameters<typeof reindexEventsToSink>[0]['sink'];
	return { sink, batches };
}

function row(uri: string, record: Record<string, unknown>, cid: string | null = 'bafycid') {
	return {
		uri,
		did: uri.split('/')[2],
		rkey: uri.split('/').pop(),
		cid,
		record: JSON.stringify(record),
		time_us: 1
	};
}

describe('reindexEventsToSink', () => {
	it('feeds every event row to the sink as a parsed created RecordEvent (phase backfill)', async () => {
		const { db } = fakeDb([
			row('at://did:plc:a/community.lexicon.calendar.event/1', { name: 'One' }),
			row('at://did:plc:b/community.lexicon.calendar.event/2', { name: 'Two' })
		]);
		const { sink, batches } = recordingSink();

		const total = await reindexEventsToSink({ db, sink });

		expect(total).toBe(2);
		expect(batches).toHaveLength(1);
		expect(batches[0].ctx).toEqual({ phase: 'backfill' });
		const recs = batches[0].records;
		expect(recs[0]).toMatchObject({
			kind: 'created',
			uri: 'at://did:plc:a/community.lexicon.calendar.event/1',
			did: 'did:plc:a',
			collection: EVENT_COLLECTION,
			rkey: '1',
			cid: 'bafycid',
			// record arrives parsed, not as the stored JSON string
			record: { name: 'One' },
			time_us: 1
		});
	});

	it('pages through D1 with LIMIT/OFFSET until a short page', async () => {
		const { db, binds } = fakeDb([
			row('at://did:plc:a/community.lexicon.calendar.event/1', {}),
			row('at://did:plc:a/community.lexicon.calendar.event/2', {}),
			row('at://did:plc:a/community.lexicon.calendar.event/3', {})
		]);
		const { sink, batches } = recordingSink();

		const total = await reindexEventsToSink({ db, sink, batchSize: 2 });

		expect(total).toBe(3);
		expect(binds).toEqual([
			{ limit: 2, offset: 0 },
			{ limit: 2, offset: 2 }
		]);
		expect(batches.map((b) => b.records.length)).toEqual([2, 1]);
	});

	it('maps a null cid to an empty string', async () => {
		const { db } = fakeDb([
			row('at://did:plc:a/community.lexicon.calendar.event/1', { name: 'X' }, null)
		]);
		const { sink, batches } = recordingSink();

		await reindexEventsToSink({ db, sink });

		expect(batches[0].records[0].cid).toBe('');
	});
});
