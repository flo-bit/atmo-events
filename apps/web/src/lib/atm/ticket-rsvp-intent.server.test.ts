import type { Cookies } from '@sveltejs/kit';
import { validate as validateTid } from '@atcute/tid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearMatchingTicketRsvpIntent,
	completeTicketRsvpIntent,
	discardTicketRsvpIntentsForEvent,
	getTicketRsvpIntent,
	getTicketRsvpIntents,
	setTicketRsvpIntent
} from './ticket-rsvp-intent.server';

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
	buyerDid: 'did:plc:buyer',
	eventUri: 'at://did:plc:host/community.lexicon.calendar.event/demo'
};

afterEach(() => vi.useRealTimers());

describe('signed ticket RSVP intent', () => {
	it('binds the exact buyer, event, and checkout token', () => {
		const cookies = cookieJar();
		const stored = setTicketRsvpIntent(
			cookies,
			{ ...expected, checkoutToken: 'checkout-token' },
			false
		);

		expect(getTicketRsvpIntent(cookies, expected)).toMatchObject({
			...expected,
			checkoutToken: 'checkout-token',
			rsvpRkey: stored.rsvpRkey
		});
		expect(validateTid(stored.rsvpRkey)).toBe(true);
		expect(getTicketRsvpIntent(cookies, { ...expected, buyerDid: 'did:plc:other' })).toBeNull();
		expect(
			getTicketRsvpIntent(cookies, { ...expected, eventUri: `${expected.eventUri}-other` })
		).toBeNull();
		expect(
			clearMatchingTicketRsvpIntent(cookies, { ...expected, checkoutToken: 'wrong-token' })
		).toBe(false);
		expect(
			clearMatchingTicketRsvpIntent(cookies, {
				...expected,
				checkoutToken: 'checkout-token'
			})
		).toBe(true);
		expect(getTicketRsvpIntent(cookies, expected)).toBeNull();
	});

	it('preserves concurrent checkouts and reuses one RSVP key per buyer and event', () => {
		const cookies = cookieJar();
		const first = setTicketRsvpIntent(
			cookies,
			{ ...expected, checkoutToken: 'checkout-one' },
			false
		);
		const second = setTicketRsvpIntent(
			cookies,
			{ ...expected, checkoutToken: 'checkout-two' },
			false
		);
		const simultaneousJar = cookieJar();
		const simultaneous = setTicketRsvpIntent(
			simultaneousJar,
			{ ...expected, checkoutToken: 'checkout-simultaneous' },
			false
		);
		setTicketRsvpIntent(
			cookies,
			{ ...expected, eventUri: `${expected.eventUri}-other`, checkoutToken: 'checkout-other' },
			false
		);

		expect(second.rsvpRkey).toBe(first.rsvpRkey);
		expect(simultaneous.rsvpRkey).toBe(first.rsvpRkey);
		expect(cookies.getAll()).toHaveLength(3);
		expect(getTicketRsvpIntents(cookies, expected)).toHaveLength(2);
		expect(completeTicketRsvpIntent(cookies, { ...expected, rsvpRkey: first.rsvpRkey })).toBe(true);
		expect(getTicketRsvpIntents(cookies, expected)).toEqual([]);
		expect(
			getTicketRsvpIntent(cookies, {
				...expected,
				eventUri: `${expected.eventUri}-other`
			})
		).not.toBeNull();
		expect(
			discardTicketRsvpIntentsForEvent(cookies, {
				...expected,
				eventUri: `${expected.eventUri}-other`
			})
		).toBe(true);
		expect(cookies.getAll()).toHaveLength(0);
	});

	it('bounds the number of in-flight intent cookies', () => {
		const cookies = cookieJar();
		for (let index = 0; index < 6; index += 1) {
			setTicketRsvpIntent(
				cookies,
				{
					...expected,
					eventUri: `${expected.eventUri}-${index}`,
					checkoutToken: `checkout-${index}`
				},
				false
			);
		}
		expect(cookies.getAll()).toHaveLength(4);
		expect(
			getTicketRsvpIntent(cookies, { ...expected, eventUri: `${expected.eventUri}-5` })
		).not.toBeNull();
	});

	it('expires after one hour', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
		const cookies = cookieJar();
		setTicketRsvpIntent(cookies, { ...expected, checkoutToken: 'checkout-token' }, false);
		vi.setSystemTime(new Date('2026-07-21T13:00:01Z'));
		expect(getTicketRsvpIntent(cookies, expected)).toBeNull();
	});
});
