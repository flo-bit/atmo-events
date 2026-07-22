import type { Cookies } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearMatchingTicketPurchaseIntent,
	consumeTicketPurchaseResult,
	getTicketPurchaseIntent,
	markTicketPurchaseResult,
	setTicketPurchaseIntent
} from './ticket-purchase-intent.server';

function cookieJar(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		getAll: () => [...values].map(([name, value]) => ({ name, value })),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	} as unknown as Cookies;
}

const expected = {
	eventUri: 'at://did:plc:host/community.lexicon.calendar.event/demo',
	checkoutToken: 'checkout-token'
};

afterEach(() => vi.useRealTimers());

describe('signed ticket purchase intent', () => {
	it('never turns an unverified or mismatched token into a renderable result', () => {
		const cookies = cookieJar();
		setTicketPurchaseIntent(cookies, expected, false);

		expect(consumeTicketPurchaseResult(cookies, expected.eventUri)).toBeNull();
		expect(
			markTicketPurchaseResult(
				cookies,
				{ ...expected, checkoutToken: 'query-string-token' },
				'confirmed',
				false
			)
		).toBe(false);
		expect(consumeTicketPurchaseResult(cookies, expected.eventUri)).toBeNull();
		expect(getTicketPurchaseIntent(cookies, expected)?.status).toBe('started');
	});

	it('exposes a one-shot result only after the matching intent is marked', () => {
		const cookies = cookieJar();
		setTicketPurchaseIntent(cookies, expected, false);

		expect(markTicketPurchaseResult(cookies, expected, 'processing', false)).toBe(true);
		expect(consumeTicketPurchaseResult(cookies, expected.eventUri)).toBe('processing');
		expect(consumeTicketPurchaseResult(cookies, expected.eventUri)).toBeNull();
		expect(getTicketPurchaseIntent(cookies, expected)).toBeNull();
	});

	it('binds results to the exact event and supports confirmed guest checkouts', () => {
		const cookies = cookieJar();
		setTicketPurchaseIntent(cookies, expected, false);
		expect(
			markTicketPurchaseResult(
				cookies,
				{ ...expected, eventUri: `${expected.eventUri}-other` },
				'confirmed',
				false
			)
		).toBe(false);

		expect(markTicketPurchaseResult(cookies, expected, 'confirmed', false)).toBe(true);
		expect(consumeTicketPurchaseResult(cookies, `${expected.eventUri}-other`)).toBeNull();
		expect(consumeTicketPurchaseResult(cookies, expected.eventUri)).toBe('confirmed');
	});

	it('can clear a cancelled checkout without affecting another intent', () => {
		const cookies = cookieJar();
		setTicketPurchaseIntent(cookies, expected, false);
		const other = { ...expected, checkoutToken: 'checkout-other' };
		setTicketPurchaseIntent(cookies, other, false);

		expect(clearMatchingTicketPurchaseIntent(cookies, expected)).toBe(true);
		expect(getTicketPurchaseIntent(cookies, expected)).toBeNull();
		expect(getTicketPurchaseIntent(cookies, other)).not.toBeNull();
	});

	it('expires before a stale return can be confirmed', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
		const cookies = cookieJar();
		setTicketPurchaseIntent(cookies, expected, false);
		vi.setSystemTime(new Date('2026-07-21T13:00:01Z'));

		expect(getTicketPurchaseIntent(cookies, expected)).toBeNull();
		expect(markTicketPurchaseResult(cookies, expected, 'confirmed', false)).toBe(false);
	});
});
