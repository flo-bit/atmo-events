import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtmApiError } from './sdk';

const mocks = vi.hoisted(() => ({
	getTicketAvailability: vi.fn(),
	flush: vi.fn(),
	getAtmHandle: vi.fn()
}));

vi.mock('./client', () => ({
	getAtmHandle: mocks.getAtmHandle
}));

import {
	probeOrganizerTicketSync,
	syncTicketEventReference,
	ticketEventIdFromAvailability,
	ticketEventReferenceUpdate
} from './organizer-sync.server';

describe('organizer ticket event reference sync', () => {
	beforeEach(() => {
		mocks.getTicketAvailability.mockReset();
		mocks.flush.mockReset();
		mocks.getAtmHandle.mockReset();
		mocks.getAtmHandle.mockResolvedValue({
			environment: 'test',
			atm: { getTicketAvailability: mocks.getTicketAvailability },
			flush: mocks.flush
		});
	});

	it('recognizes current and nested availability event ids', () => {
		expect(ticketEventIdFromAvailability({ eventId: 'tevt_1' })).toBe('tevt_1');
		expect(ticketEventIdFromAvailability({ event: { id: 'tevt_2' } })).toBe('tevt_2');
		expect(ticketEventIdFromAvailability({ tiers: [] })).toBeNull();
	});

	it('probes once and skips future save-time work for a confirmed unticketed event', async () => {
		mocks.getTicketAvailability.mockRejectedValue(
			new AtmApiError('EventNotFound', 'No ticket event', 404, {})
		);

		await expect(
			probeOrganizerTicketSync(
				{} as App.Platform['env'],
				'at://did:plc:owner/community.lexicon.calendar.event/summer-party'
			)
		).resolves.toBe('unticketed');
		expect(mocks.getTicketAvailability).toHaveBeenCalledTimes(1);
		expect(mocks.flush).toHaveBeenCalledTimes(1);
	});

	it('keeps the fail-safe sync hook enabled when the probe is inconclusive', async () => {
		mocks.getTicketAvailability.mockRejectedValue(new Error('ATM unavailable'));

		await expect(
			probeOrganizerTicketSync(
				{} as App.Platform['env'],
				'at://did:plc:owner/community.lexicon.calendar.event/summer-party'
			)
		).resolves.toBe('unknown');
		expect(mocks.flush).toHaveBeenCalledTimes(1);
	});

	it('does not block the editor when the ATM app session cannot be opened', async () => {
		mocks.getAtmHandle.mockRejectedValue(new Error('PDS unavailable'));

		await expect(
			probeOrganizerTicketSync(
				{} as App.Platform['env'],
				'at://did:plc:owner/community.lexicon.calendar.event/summer-party'
			)
		).resolves.toBe('unknown');
		expect(mocks.getTicketAvailability).not.toHaveBeenCalled();
	});

	it('updates only CID, title, and start time and never supplies status', () => {
		const update = ticketEventReferenceUpdate({
			eventId: 'tevt_1',
			eventCid: 'bafy-new',
			source: { name: '  New title  ', startsAt: '2026-09-05T18:00:00.000Z' }
		});

		expect(update).toEqual({
			eventId: 'tevt_1',
			eventCid: 'bafy-new',
			title: 'New title',
			startsAt: '2026-09-05T18:00:00.000Z'
		});
		expect(update).not.toHaveProperty('status');
	});

	it('is retryable after ATM fails without performing another calendar write', async () => {
		const updateTicketEvent = vi
			.fn()
			.mockRejectedValueOnce(new Error('temporary failure'))
			.mockResolvedValueOnce(undefined);
		const input = {
			eventId: 'tevt_1',
			eventCid: 'bafy-new',
			source: { name: 'New title', startsAt: '2026-09-05T18:00:00.000Z' },
			updateTicketEvent
		};

		await expect(syncTicketEventReference(input)).rejects.toThrow('temporary failure');
		await expect(syncTicketEventReference(input)).resolves.toBeUndefined();
		expect(updateTicketEvent).toHaveBeenCalledTimes(2);
		expect(updateTicketEvent.mock.calls[1]?.[0]).not.toHaveProperty('status');
	});
});
