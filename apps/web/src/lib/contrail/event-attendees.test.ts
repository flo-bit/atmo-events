import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';
import { eventAttendeesFromRecord, listEventAttendeesFromContrail } from '../contrail';

const rsvp = (did: `did:${string}:${string}`) =>
	({
		did,
		collection: 'community.lexicon.calendar.rsvp',
		rkey: 'test',
		time_us: 0,
		uri: `at://${did}/community.lexicon.calendar.rsvp/test`,
		value: {
			$type: 'community.lexicon.calendar.rsvp',
			createdAt: '2026-10-31T00:00:00Z',
			subject: { uri: 'at://did:plc:host/community.lexicon.calendar.event/test', cid: 'cid' }
		}
	}) as const;

function record(overrides: Partial<Parameters<typeof eventAttendeesFromRecord>[0]> = {}) {
	return {
		did: 'did:plc:host',
		collection: 'community.lexicon.calendar.event',
		rkey: 'test',
		time_us: 0,
		uri: 'at://did:plc:host/community.lexicon.calendar.event/test',
		value: {},
		...overrides
	} as Parameters<typeof eventAttendeesFromRecord>[0];
}

describe('eventAttendeesFromRecord', () => {
	it('uses the index totals rather than the size of the hydrated sample', () => {
		const attendees = eventAttendeesFromRecord(
			record({
				rsvps: { going: [rsvp('did:plc:alice')], interested: [] },
				rsvpsGoingCount: 214,
				rsvpsInterestedCount: 75,
				profiles: [{ did: 'did:plc:alice', handle: 'alice.test' }]
			})
		);
		expect(attendees.going.map((a) => a.handle)).toEqual(['alice.test']);
		expect(attendees.goingCount).toBe(214);
		expect(attendees.interestedCount).toBe(75);
	});

	it('keeps one entry per account and never reports fewer than it lists', () => {
		const attendees = eventAttendeesFromRecord(
			record({
				rsvps: { going: [rsvp('did:plc:alice'), rsvp('did:plc:alice')], interested: [] },
				rsvpsGoingCount: 0
			})
		);
		expect(attendees.going).toHaveLength(1);
		expect(attendees.goingCount).toBe(1);
	});

	it('handles a record without hydrated rsvps', () => {
		const attendees = eventAttendeesFromRecord(record());
		expect(attendees).toEqual({ going: [], interested: [], goingCount: 0, interestedCount: 0 });
	});
});

describe('listEventAttendeesFromContrail', () => {
	const eventUri = 'at://did:plc:host/community.lexicon.calendar.event/test';
	const success = { ok: true, data: { records: [rsvp('did:plc:alice')] } };
	const failure = { ok: false, status: 500, data: { error: 'InternalServerError' } };

	it.each([
		['going', failure, success],
		['interested', success, failure],
		['both', failure, failure]
	])(
		'rejects when %s fails instead of returning a partial list',
		async (_group, going, interested) => {
			const get = vi.fn().mockResolvedValueOnce(going).mockResolvedValueOnce(interested);
			const client = { get } as unknown as Client;
			await expect(listEventAttendeesFromContrail(client, eventUri)).rejects.toThrow(
				'Unable to load attendees'
			);

			// A later modal open can retry the whole operation successfully.
			get.mockResolvedValueOnce(success).mockResolvedValueOnce(success);
			const retried = await listEventAttendeesFromContrail(client, eventUri);
			expect(retried.going.map((a) => a.did)).toEqual(['did:plc:alice']);
			expect(retried.interested.map((a) => a.did)).toEqual(['did:plc:alice']);
			expect(get).toHaveBeenCalledTimes(4);
		}
	);

	it('propagates network failures', async () => {
		const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success);
		await expect(
			listEventAttendeesFromContrail({ get } as unknown as Client, eventUri)
		).rejects.toThrow('offline');
	});

	it('accepts successful empty responses', async () => {
		const get = vi.fn().mockResolvedValue({ ok: true, data: { records: [], profiles: [] } });
		await expect(
			listEventAttendeesFromContrail({ get } as unknown as Client, eventUri)
		).resolves.toEqual({
			going: [],
			interested: [],
			goingCount: 0,
			interestedCount: 0
		});
	});
});
