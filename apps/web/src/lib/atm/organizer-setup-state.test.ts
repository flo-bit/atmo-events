import { describe, expect, it, vi } from 'vitest';
import {
	CALENDAR_EVENT_PLANNED,
	CALENDAR_EVENT_SCHEDULED,
	organizerTicketSetupState,
	publishAndActivateTicketSetup,
	TicketSetupActivationError,
	type OrganizerCalendarRecord
} from './organizer-setup-state';

const hiddenDraft: OrganizerCalendarRecord = {
	$type: 'community.lexicon.calendar.event',
	name: 'Demo event',
	startsAt: '2026-08-20T23:00:00.000Z',
	status: CALENDAR_EVENT_PLANNED,
	preferences: { showInDiscovery: false, replies: 'followers' }
};

describe('organizer ticket setup publication state', () => {
	it('accepts only the exact hidden draft and published states', () => {
		expect(organizerTicketSetupState(hiddenDraft)).toBe('hidden-draft');
		expect(
			organizerTicketSetupState({
				...hiddenDraft,
				status: CALENDAR_EVENT_SCHEDULED,
				preferences: { showInDiscovery: true }
			})
		).toBe('published');
	});

	it.each([
		['cancelled event', 'community.lexicon.calendar.event#cancelled', false],
		['unlisted scheduled event', CALENDAR_EVENT_SCHEDULED, false],
		['discoverable planned event', CALENDAR_EVENT_PLANNED, true],
		['legacy record without discovery state', CALENDAR_EVENT_PLANNED, undefined]
	])('blocks a stale return for a %s', (_label, status, showInDiscovery) => {
		expect(
			organizerTicketSetupState({
				...hiddenDraft,
				status,
				preferences:
					showInDiscovery === undefined ? {} : { showInDiscovery: Boolean(showInDiscovery) }
			})
		).toBe('blocked');
	});
});

describe('organizer ticket setup activation compensation', () => {
	it('publishes with a CID compare/swap before activating ATM', async () => {
		const calls: string[] = [];
		const writeRecord = vi.fn(async (record: OrganizerCalendarRecord, swapRecord: string) => {
			calls.push(`write:${swapRecord}`);
			expect(record.status).toBe(CALENDAR_EVENT_SCHEDULED);
			expect(record.preferences).toMatchObject({
				showInDiscovery: true,
				replies: 'followers'
			});
			return {
				uri: 'at://did:plc:organizer/community.lexicon.calendar.event/demo',
				cid: 'cid-live'
			};
		});
		const updateTicketEvent = vi.fn(async ({ status }: { status: string }) => {
			calls.push(`atm:${status}`);
		});

		const result = await publishAndActivateTicketSetup({
			eventId: 'event-1',
			sourceRecord: hiddenDraft,
			sourceCid: 'cid-draft',
			writeRecord,
			updateTicketEvent
		});

		expect(result.cid).toBe('cid-live');
		expect(calls).toEqual(['write:cid-draft', 'atm:active']);
		expect(updateTicketEvent).toHaveBeenCalledWith({
			eventId: 'event-1',
			eventCid: 'cid-live',
			status: 'active'
		});
	});

	it('restores the exact hidden draft and pauses ATM when activation fails', async () => {
		const writeRecord = vi
			.fn()
			.mockResolvedValueOnce({ uri: 'at://event', cid: 'cid-live' })
			.mockImplementationOnce(async (record: OrganizerCalendarRecord, swapRecord: string) => {
				expect(record).toEqual(hiddenDraft);
				expect(swapRecord).toBe('cid-live');
				return { uri: 'at://event', cid: 'cid-restored' };
			});
		const updateTicketEvent = vi
			.fn()
			.mockRejectedValueOnce(new Error('activation unavailable'))
			.mockResolvedValueOnce(undefined);

		const caught = await publishAndActivateTicketSetup({
			eventId: 'event-1',
			sourceRecord: hiddenDraft,
			sourceCid: 'cid-draft',
			writeRecord,
			updateTicketEvent
		}).catch((cause: unknown) => cause);

		expect(caught).toBeInstanceOf(TicketSetupActivationError);
		expect(caught).toMatchObject({ draftRestored: true, atmResynced: true });
		expect(updateTicketEvent).toHaveBeenNthCalledWith(2, {
			eventId: 'event-1',
			eventCid: 'cid-restored',
			status: 'paused'
		});
	});

	it('reports a restored draft even when the ATM pause resync must be retried', async () => {
		const writeRecord = vi
			.fn()
			.mockResolvedValueOnce({ uri: 'at://event', cid: 'cid-live' })
			.mockResolvedValueOnce({ uri: 'at://event', cid: 'cid-restored' });
		const updateTicketEvent = vi
			.fn()
			.mockRejectedValueOnce(new Error('activation unavailable'))
			.mockRejectedValueOnce(new Error('resync unavailable'));

		const caught = await publishAndActivateTicketSetup({
			eventId: 'event-1',
			sourceRecord: hiddenDraft,
			sourceCid: 'cid-draft',
			writeRecord,
			updateTicketEvent
		}).catch((cause: unknown) => cause);

		expect(caught).toBeInstanceOf(TicketSetupActivationError);
		expect(caught).toMatchObject({ draftRestored: true, atmResynced: false });
	});

	it('does not pause ATM if the PDS rollback lost its compare/swap race', async () => {
		const writeRecord = vi
			.fn()
			.mockResolvedValueOnce({ uri: 'at://event', cid: 'cid-live' })
			.mockRejectedValueOnce(new Error('record changed'));
		const updateTicketEvent = vi.fn().mockRejectedValueOnce(new Error('activation unavailable'));

		const caught = await publishAndActivateTicketSetup({
			eventId: 'event-1',
			sourceRecord: hiddenDraft,
			sourceCid: 'cid-draft',
			writeRecord,
			updateTicketEvent
		}).catch((cause: unknown) => cause);

		expect(caught).toBeInstanceOf(TicketSetupActivationError);
		expect(caught).toMatchObject({ draftRestored: false, atmResynced: false });
		expect(updateTicketEvent).toHaveBeenCalledTimes(1);
	});
});
