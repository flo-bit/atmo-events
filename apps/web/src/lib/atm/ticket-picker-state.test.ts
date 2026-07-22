import { describe, expect, it, vi } from 'vitest';
import {
	bindTicketOrderPreview,
	hasAcceptedOrganizerTicketTerms,
	isTicketOrderPreviewCurrent,
	normalizeTicketOfferCode,
	resolveStableTicketPurchaseIntent,
	ticketOfferNeedsVerifiedPreview,
	ticketPurchaseIntentSelectionKey,
	ticketPurchasePriceSummary,
	ticketPurchaseSelectionKey,
	withTicketPreviewTimeout
} from '../../../../../packages/ui/src/event-view/ticket-purchase.js';
import type { TicketTierView } from '../../../../../packages/ui/src/event-view/tickets.js';

const tier: TicketTierView = {
	tierId: 'general',
	title: 'General admission',
	currency: 'usd',
	unitAmount: 2_000,
	status: 'available',
	availableQuantity: 20,
	maxPerOrder: 4
};

describe('ticket picker quote state', () => {
	it('normalizes offer codes and binds a preview to the exact selection', () => {
		const selection = { tierId: 'general', quantity: 2, offerCode: ' friends20 ' };
		const preview = bindTicketOrderPreview(selection, {
			subtotalAmount: 4_000,
			buyerFeeAmount: 120,
			discountAmount: 800,
			totalAmount: 3_320,
			currency: 'USD',
			offerCode: 'friends20',
			offerLabel: 'Friends & family'
		});

		expect(normalizeTicketOfferCode(selection.offerCode)).toBe('FRIENDS20');
		expect(preview.offerCode).toBe('FRIENDS20');
		expect(isTicketOrderPreviewCurrent(preview, selection)).toBe(true);
		expect(ticketPurchasePriceSummary(tier, selection, preview)).toEqual({
			subtotalAmount: 4_000,
			buyerFeeAmount: 120,
			discountAmount: 800,
			totalAmount: 3_320,
			currency: 'usd',
			offerLabel: 'Friends & family',
			authoritative: true
		});
	});

	it('invalidates an applied quote when quantity, tier, or code changes', () => {
		const selection = { tierId: 'general', quantity: 1, offerCode: 'SAVE10' };
		const preview = bindTicketOrderPreview(selection, {
			subtotalAmount: 2_000,
			buyerFeeAmount: 60,
			discountAmount: 200,
			totalAmount: 1_860,
			currency: 'usd',
			offerCode: 'SAVE10'
		});

		expect(isTicketOrderPreviewCurrent(preview, { ...selection, quantity: 2 })).toBe(false);
		expect(isTicketOrderPreviewCurrent(preview, { ...selection, tierId: 'vip' })).toBe(false);
		expect(isTicketOrderPreviewCurrent(preview, { ...selection, offerCode: 'OTHER' })).toBe(false);
		expect(ticketPurchaseSelectionKey(selection)).toBe(
			ticketPurchaseSelectionKey({ ...selection, offerCode: ' save10 ' })
		);
	});

	it('falls back to public tier pricing without a current ATM quote', () => {
		expect(ticketPurchasePriceSummary(tier, { tierId: tier.tierId, quantity: 3 })).toMatchObject({
			subtotalAmount: 6_000,
			buyerFeeAmount: 0,
			discountAmount: 0,
			totalAmount: 6_000,
			authoritative: false
		});
	});

	it('requires acceptance only when the organizer supplied terms', () => {
		expect(hasAcceptedOrganizerTicketTerms(undefined, false)).toBe(true);
		const terms = { url: 'https://host.example/terms', version: 'terms-v1' };
		expect(hasAcceptedOrganizerTicketTerms(terms, false)).toBe(false);
		expect(hasAcceptedOrganizerTicketTerms(terms, true)).toBe(true);
	});

	it('scopes purchase intents to tier, quantity, applied code, and terms version', () => {
		const base = {
			tierId: 'general',
			quantity: 2,
			offerCode: ' save10 ',
			organizerTermsVersion: 'terms-v2'
		};
		expect(ticketPurchaseIntentSelectionKey(base)).toBe(
			ticketPurchaseIntentSelectionKey({ ...base, offerCode: 'SAVE10' })
		);
		expect(ticketPurchaseIntentSelectionKey(base)).not.toBe(
			ticketPurchaseIntentSelectionKey({ ...base, quantity: 3 })
		);
		expect(ticketPurchaseIntentSelectionKey(base)).not.toBe(
			ticketPurchaseIntentSelectionKey({ ...base, organizerTermsVersion: 'terms-v3' })
		);
	});

	it('reuses one purchase intent across retries and replaces it after selection changes', () => {
		let sequence = 0;
		const mint = () => `intent-${++sequence}-abcdefghijkl`;
		const selection = {
			tierId: 'general',
			quantity: 2,
			offerCode: 'SAVE10',
			organizerTermsVersion: 'terms-v2'
		};
		const first = resolveStableTicketPurchaseIntent(null, selection, mint);
		const retry = resolveStableTicketPurchaseIntent(first, selection, mint);
		const changed = resolveStableTicketPurchaseIntent(first, { ...selection, quantity: 3 }, mint);

		expect(retry).toBe(first);
		expect(retry.intentId).toBe(first.intentId);
		expect(changed.intentId).not.toBe(first.intentId);
		expect(sequence).toBe(2);
	});

	it('requires an exact authoritative preview before using an offer code', () => {
		const selection = { tierId: 'general', quantity: 1, offerCode: 'SAVE10' };
		expect(ticketOfferNeedsVerifiedPreview(selection, null)).toBe(true);
		const preview = bindTicketOrderPreview(selection, {
			subtotalAmount: 2_000,
			buyerFeeAmount: 60,
			discountAmount: 200,
			totalAmount: 1_860,
			currency: 'usd',
			offerCode: 'SAVE10'
		});
		expect(ticketOfferNeedsVerifiedPreview(selection, preview)).toBe(false);
		expect(ticketOfferNeedsVerifiedPreview({ ...selection, offerCode: 'OTHER' }, preview)).toBe(
			true
		);
	});

	it('times out a stuck pricing request so the picker can offer retry', async () => {
		vi.useFakeTimers();
		try {
			const result = withTicketPreviewTimeout(new Promise<never>(() => {}), 50);
			const rejection = expect(result).rejects.toThrow('took too long');
			await vi.advanceTimersByTimeAsync(50);
			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects malformed monetary previews', () => {
		expect(() =>
			bindTicketOrderPreview(
				{ tierId: 'general', quantity: 1 },
				{
					subtotalAmount: 2_000.5,
					buyerFeeAmount: 0,
					discountAmount: 0,
					totalAmount: 2_000,
					currency: 'usd'
				}
			)
		).toThrow('subtotalAmount');
	});
});
