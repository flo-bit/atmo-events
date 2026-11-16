import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRecord: vi.fn() }));
vi.mock('cloudflare:workers', () => ({ env: { DB: {} } }));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail.js', async () => {
	// The real flattening needs none of the module's server-only imports.
	return {
		getEventRecordFromContrail: mocks.getRecord,
		flattenEventRecord: (record: Record<string, unknown> & { value?: { startsAt?: string } }) =>
			record.value?.startsAt
				? { ...record.value, did: record.did, rkey: record.rkey, uri: record.uri }
				: null
	};
});
import { GET } from './+server.js';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
function request(query: Record<string, string>) {
	return GET({
		url: new URL(`https://atmo.rsvp/api/linked-records/event?${new URLSearchParams(query)}`)
	} as Parameters<typeof GET>[0]);
}

describe('linked event read', () => {
	beforeEach(() => mocks.getRecord.mockReset());
	it.each<Record<string, string>>([
		{},
		{ actor: 'bad actor', rkey: 'event' },
		{ actor: did, rkey: '..' },
		{ actor: did, rkey: 'a/b' }
	])('rejects %j before reading', async (query) => {
		await expect(request(query)).rejects.toMatchObject({ status: 400 });
		expect(mocks.getRecord).not.toHaveBeenCalled();
	});
	it('returns the flattened event uncached', async () => {
		mocks.getRecord.mockResolvedValue({
			did,
			rkey: 'event',
			uri: `at://${did}/community.lexicon.calendar.event/event`,
			value: { name: 'Meetup', startsAt: '2026-11-03T12:00:00Z' }
		});
		const response = await request({ actor: 'host.example', rkey: 'event' });
		expect(await response.json()).toMatchObject({ did, rkey: 'event', name: 'Meetup' });
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(mocks.getRecord).toHaveBeenCalledWith({}, { did: 'host.example', rkey: 'event' });
	});
	it('is not found for a missing, hidden or private event', async () => {
		mocks.getRecord.mockResolvedValue(null);
		await expect(request({ actor: did, rkey: 'event' })).rejects.toMatchObject({ status: 404 });
	});
});
