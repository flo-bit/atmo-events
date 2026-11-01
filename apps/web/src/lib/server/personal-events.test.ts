import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';

vi.mock('#lib/contrail.js', () => ({
	flattenEventRecord: vi.fn((record) => record),
	flattenEventRecords: vi.fn((records) => records),
	listEventRecordsFromContrail: vi.fn()
}));

import { getPersonalEvents } from './personal-events.js';
import { listEventRecordsFromContrail } from '#lib/contrail.js';

const event = (uri: string, startsAt: string, endsAt?: string) => ({ uri, startsAt, endsAt });
const rsvp = (status: string, event?: unknown) => ({
	value: { status: `community.lexicon.calendar.rsvp#${status}` },
	event
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('personal profile events', () => {
	it('merges hosting, going and interested, deduplicates and sorts upcoming and past events', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
		const ongoing = event('ongoing', '2026-07-01T10:00:00Z', '2026-07-01T14:00:00Z');
		const upcoming = event('upcoming', '2026-07-02T12:00:00Z');
		const interested = event('interested', '2026-07-03T12:00:00Z');
		const past = event('past', '2026-06-30T12:00:00Z');
		const older = event('older', '2026-06-01T12:00:00Z');
		const get = vi.fn(async () => ({
			ok: true,
			data: {
				records: [
					rsvp('interested', interested),
					rsvp('going', upcoming),
					rsvp('going', older),
					rsvp('notgoing', event('declined', '2026-07-04T12:00:00Z')),
					rsvp('going')
				]
			}
		}));
		vi.mocked(listEventRecordsFromContrail).mockResolvedValueOnce({
			records: [past, upcoming, ongoing]
		} as never);

		const result = await getPersonalEvents({ get } as unknown as Client, 'did:plc:alice');

		expect(result.upcoming.map((e) => e.uri)).toEqual(['ongoing', 'upcoming', 'interested']);
		expect(result.past.map((e) => e.uri)).toEqual(['past', 'older']);
		expect(get).toHaveBeenCalledWith('rsvp.atmo.rsvp.listRecords', {
			params: { actor: 'did:plc:alice', hydrateEvent: true, limit: 100 }
		});
		expect(listEventRecordsFromContrail).toHaveBeenCalledWith(expect.anything(), {
			actor: 'did:plc:alice',
			sort: 'startsAt',
			order: 'desc',
			limit: 100
		});
	});

	it('returns empty lists when neither query has records', async () => {
		const get = vi.fn(async () => ({ ok: false }));
		vi.mocked(listEventRecordsFromContrail).mockResolvedValueOnce(null);
		await expect(getPersonalEvents({ get } as unknown as Client, 'did:plc:alice')).resolves.toEqual(
			{ upcoming: [], past: [] }
		);
	});
});
