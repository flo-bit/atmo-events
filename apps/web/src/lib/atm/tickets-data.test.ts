import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getTicketAvailability: vi.fn(),
	flush: vi.fn(),
	getAtmHandle: vi.fn()
}));

vi.mock('./client', () => ({
	getAtmHandle: mocks.getAtmHandle
}));

vi.mock('./config', () => ({
	atmConfigured: () => true,
	getAtmConfig: () => ({
		environment: 'test',
		brokerUrl: 'https://checkout.atmosphere.money'
	})
}));

import { loadAvailabilityFresh, loadEventTicketing } from './tickets-data';

describe('ATM ticket availability mutation read', () => {
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

	it('re-reads ATM on every call rather than reusing event-page cache state', async () => {
		mocks.getTicketAvailability
			.mockResolvedValueOnce({
				tiers: [
					{
						tierId: 'tier-1',
						title: 'Early bird',
						unitAmount: 1000,
						currency: 'usd',
						status: 'available',
						availableQuantity: 4,
						maxPerOrder: 2
					}
				]
			})
			.mockResolvedValueOnce({
				tiers: [
					{
						tierId: 'tier-1',
						title: 'Early bird',
						unitAmount: 1000,
						currency: 'usd',
						status: 'sold-out',
						availableQuantity: 0,
						maxPerOrder: 2
					}
				]
			});

		const env = {} as App.Platform['env'];
		const eventUri =
			'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party';
		const first = await loadAvailabilityFresh(env, eventUri);
		const second = await loadAvailabilityFresh(env, eventUri);

		expect(first?.[0]).toMatchObject({ status: 'available', availableQuantity: 4 });
		expect(second?.[0]).toMatchObject({ status: 'sold-out', availableQuantity: 0 });
		expect(mocks.getTicketAvailability).toHaveBeenCalledTimes(2);
		expect(mocks.flush).toHaveBeenCalledTimes(2);
	});

	it('projects safe organizer terms into the event picker', async () => {
		mocks.getTicketAvailability.mockResolvedValue({
			event: {
				organizerTerms: {
					url: 'https://organizer.example/attendance-terms',
					label: 'Attendance terms',
					version: 'terms-v3'
				}
			},
			tiers: [
				{
					tierId: 'tier-1',
					title: 'General admission',
					unitAmount: 1_000,
					currency: 'usd',
					status: 'available',
					availableQuantity: 10,
					maxPerOrder: 4
				}
			]
		});

		const ticketing = await loadEventTicketing(
			{} as App.Platform['env'],
			'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
			null,
			null
		);

		expect(ticketing?.organizerTerms).toEqual({
			url: 'https://organizer.example/attendance-terms',
			label: 'Attendance terms',
			version: 'terms-v3'
		});
	});

	it('fails closed on an unsafe organizer terms projection', async () => {
		mocks.getTicketAvailability.mockResolvedValue({
			event: {
				organizerTerms: { url: 'javascript:alert(1)', label: 'Unsafe', version: 'terms-v1' }
			},
			tiers: [
				{
					tierId: 'tier-1',
					title: 'General admission',
					unitAmount: 1_000,
					currency: 'usd',
					status: 'available',
					availableQuantity: 10,
					maxPerOrder: 4
				}
			]
		});

		const ticketing = await loadEventTicketing(
			{} as App.Platform['env'],
			'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
			null,
			null
		);
		expect(ticketing?.organizerTerms).toBeUndefined();
		expect(ticketing?.organizerTermsError).toContain('terms link is invalid');
	});

	it('fails closed when ATM terms are missing an opaque version', async () => {
		mocks.getTicketAvailability.mockResolvedValue({
			event: {
				organizerTerms: { url: 'https://organizer.example/terms', label: 'Event terms' }
			},
			tiers: [
				{
					tierId: 'tier-1',
					title: 'General admission',
					unitAmount: 1_000,
					currency: 'usd',
					status: 'available',
					availableQuantity: 10,
					maxPerOrder: 4
				}
			]
		});

		const ticketing = await loadEventTicketing(
			{} as App.Platform['env'],
			'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
			null,
			null
		);
		expect(ticketing?.organizerTerms).toBeUndefined();
		expect(ticketing?.organizerTermsError).toContain('need to be refreshed');
	});
});
