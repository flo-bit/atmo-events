import { describe, expect, it } from 'vitest';
import type { AtmTicketSummary } from './sdk';
import { buildViewerTicketBadges } from './ticket-badges';

describe('buildViewerTicketBadges', () => {
	it('marks only events with active tickets and prefers the ATM presentation icon', () => {
		const active: AtmTicketSummary = {
			id: 'ticket-active',
			status: 'active',
			event: { uri: 'at://did:plc:host/community.lexicon.calendar.event/upcoming' },
			presentation: { iconUrl: 'https://checkout.example/atmosphere-tickets.svg' }
		};
		const refunded: AtmTicketSummary = {
			id: 'ticket-refunded',
			status: 'refunded',
			event: { uri: 'at://did:plc:host/community.lexicon.calendar.event/past' }
		};

		expect(
			buildViewerTicketBadges([active, refunded], 'https://fallback.example/icon.svg')
		).toEqual({
			'at://did:plc:host/community.lexicon.calendar.event/upcoming':
				'https://checkout.example/atmosphere-tickets.svg'
		});
	});

	it('uses the fallback icon and presentation event URI when needed', () => {
		const ticket: AtmTicketSummary = {
			id: 'ticket-fallback',
			status: 'active',
			presentation: {
				event: { uri: 'at://did:plc:host/community.lexicon.calendar.event/fallback' }
			}
		};

		expect(buildViewerTicketBadges([ticket], 'https://fallback.example/icon.svg')).toEqual({
			'at://did:plc:host/community.lexicon.calendar.event/fallback':
				'https://fallback.example/icon.svg'
		});
	});
});
