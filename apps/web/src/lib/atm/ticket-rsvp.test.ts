import { describe, expect, it } from 'vitest';
import {
	hasTicketCheckoutReturnParams,
	hasActiveViewerTicket,
	isTicketCheckoutReturn,
	parseTicketCheckoutReturn,
	ticketPurchaseReturnAction,
	ticketReturnUrlWithoutCheckoutParams
} from './ticket-rsvp';

describe('ticket purchase auto-RSVP guards', () => {
	it('recognizes only matching terminal ATM ticket returns with a checkout token', () => {
		const success = new URL(
			'https://events.example/p/did:plc:test/e/demo?tickets=success&session=tok_123&status=success'
		);
		const cancelled = new URL(
			'https://events.example/p/did:plc:test/e/demo?tickets=cancelled&session=tok_123&status=cancelled'
		);
		expect(isTicketCheckoutReturn(success)).toBe(true);
		expect(isTicketCheckoutReturn(cancelled)).toBe(true);
		expect(parseTicketCheckoutReturn(success)).toEqual({
			kind: 'success',
			checkoutToken: 'tok_123'
		});
		expect(parseTicketCheckoutReturn(cancelled)).toEqual({
			kind: 'cancelled',
			checkoutToken: 'tok_123'
		});

		for (const url of [
			'https://events.example/p/did:plc:test/e/demo?tickets=success',
			'https://events.example/p/did:plc:test/e/demo?tickets=success&session=tok_123&status=cancelled',
			'https://events.example/p/did:plc:test/e/demo?session=tok_123&status=success'
		]) {
			expect(isTicketCheckoutReturn(new URL(url))).toBe(false);
		}
	});

	it('recognizes partial return parameters for bearer cleanup without treating them as success', () => {
		const malformed = new URL(
			'https://events.example/p/did:plc:test/e/demo?tickets=success&session=secret&status=cancelled'
		);
		expect(hasTicketCheckoutReturnParams(malformed)).toBe(true);
		expect(parseTicketCheckoutReturn(malformed)).toBeNull();
		expect(
			hasTicketCheckoutReturnParams(new URL('https://events.example/event?view=compact'))
		).toBe(false);
		expect(
			hasTicketCheckoutReturnParams(
				new URL('https://events.example/event?created=true&tickets=configured')
			)
		).toBe(false);
	});

	it('requires an active issued ticket for the signed-in viewer', () => {
		expect(hasActiveViewerTicket(null)).toBe(false);
		expect(hasActiveViewerTicket({ viewerTickets: [] })).toBe(false);
		expect(hasActiveViewerTicket({ viewerTickets: [{ status: 'refunded' }] })).toBe(false);
		expect(
			hasActiveViewerTicket({ viewerTickets: [{ status: 'voided' }, { status: 'active' }] })
		).toBe(true);
	});

	it('requires ATM status before rendering a purchase result', () => {
		expect(ticketPurchaseReturnAction('completed', 'success')).toBe('confirmed');
		expect(ticketPurchaseReturnAction('pending', 'success')).toBe('processing');
		expect(ticketPurchaseReturnAction('failed', 'success')).toBe('clear');
		expect(ticketPurchaseReturnAction(undefined, 'success')).toBe('none');
		expect(ticketPurchaseReturnAction('pending', 'cancelled')).toBe('clear');
	});

	it('removes checkout-only parameters while preserving unrelated state', () => {
		const url = new URL(
			'https://events.example/p/did:plc:test/e/demo?view=compact&tickets=success&session=secret&status=success#tickets'
		);
		expect(ticketReturnUrlWithoutCheckoutParams(url)).toBe(
			'/p/did:plc:test/e/demo?view=compact#tickets'
		);
	});
});
