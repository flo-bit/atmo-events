import { createHash } from 'node:crypto';
import { create as createTid } from '@atcute/tid';
import type { Cookies } from '@sveltejs/kit';
import { getSignedCookie, setSignedCookie } from '$lib/atproto/server/signed-cookie';

const COOKIE_PREFIX = 'atm_ticket_rsvp_';
const INTENT_TTL_MS = 60 * 60 * 1_000;
const MAX_INTENTS = 4;

export type TicketRsvpIntent = {
	buyerDid: string;
	eventUri: string;
	checkoutToken: string;
	/** Stable for this buyer+event, preventing duplicate records across tabs. */
	rsvpRkey: string;
	createdAt: number;
};

type NamedIntent = TicketRsvpIntent & { cookieName: string };

function cookieNameForToken(checkoutToken: string): string {
	const digest = createHash('sha256').update(checkoutToken).digest('hex').slice(0, 24);
	return `${COOKIE_PREFIX}${digest}`;
}

/** Produce a valid, deterministic TID without depending on another tab's cookie state. */
function rsvpRkeyFor(buyerDid: string, eventUri: string): string {
	const digest = createHash('sha256').update(buyerDid).update('\0').update(eventUri).digest();
	let timestamp = 0;
	for (let index = 0; index < 6; index += 1) timestamp = timestamp * 256 + digest[index]!;
	const clockid = ((digest[6]! << 8) | digest[7]!) & 1023;
	return createTid(timestamp, clockid);
}

function isValidIntent(value: unknown, now = Date.now()): value is TicketRsvpIntent {
	if (!value || typeof value !== 'object') return false;
	const intent = value as Partial<TicketRsvpIntent>;
	return (
		typeof intent.buyerDid === 'string' &&
		intent.buyerDid.length > 0 &&
		typeof intent.eventUri === 'string' &&
		intent.eventUri.length > 0 &&
		typeof intent.checkoutToken === 'string' &&
		intent.checkoutToken.length > 0 &&
		typeof intent.rsvpRkey === 'string' &&
		intent.rsvpRkey.length > 0 &&
		typeof intent.createdAt === 'number' &&
		intent.createdAt <= now &&
		now - intent.createdAt <= INTENT_TTL_MS
	);
}

function readIntents(cookies: Cookies): NamedIntent[] {
	const intents: NamedIntent[] = [];
	for (const { name } of cookies.getAll()) {
		if (!name.startsWith(COOKIE_PREFIX)) continue;
		const raw = getSignedCookie(cookies, name);
		if (!raw) continue;
		try {
			const parsed: unknown = JSON.parse(raw);
			if (isValidIntent(parsed)) intents.push({ ...parsed, cookieName: name });
		} catch {
			// Ignore malformed or stale cookies; their browser expiry remains the backstop.
		}
	}
	return intents.sort((a, b) => b.createdAt - a.createdAt);
}

/** Add a checkout in its own signed cookie so simultaneous responses cannot overwrite it. */
export function setTicketRsvpIntent(
	cookies: Cookies,
	intent: Omit<TicketRsvpIntent, 'createdAt' | 'rsvpRkey'>,
	secure: boolean
): TicketRsvpIntent {
	const stored: TicketRsvpIntent = {
		...intent,
		rsvpRkey: rsvpRkeyFor(intent.buyerDid, intent.eventUri),
		createdAt: Date.now()
	};
	const cookieName = cookieNameForToken(intent.checkoutToken);
	setSignedCookie(cookies, cookieName, JSON.stringify(stored), {
		httpOnly: true,
		maxAge: INTENT_TTL_MS / 1_000,
		path: '/',
		sameSite: 'lax',
		secure
	});

	// Keep the browser footprint bounded during ordinary sequential use. Because
	// each intent has its own name, truly simultaneous responses may briefly
	// exceed the cap but cannot destroy one another.
	const existing = readIntents(cookies).filter((item) => item.cookieName !== cookieName);
	for (const stale of existing.slice(MAX_INTENTS - 1)) {
		cookies.delete(stale.cookieName, { path: '/' });
	}
	return stored;
}

export function getTicketRsvpIntents(
	cookies: Cookies,
	expected: { buyerDid: string; eventUri: string }
): TicketRsvpIntent[] {
	return readIntents(cookies)
		.filter(
			(intent) => intent.buyerDid === expected.buyerDid && intent.eventUri === expected.eventUri
		)
		.map((namedIntent) => {
			const intent = { ...namedIntent } as Partial<NamedIntent>;
			delete intent.cookieName;
			return intent as TicketRsvpIntent;
		});
}

export function getTicketRsvpIntent(
	cookies: Cookies,
	expected: { buyerDid: string; eventUri: string }
): TicketRsvpIntent | null {
	return getTicketRsvpIntents(cookies, expected)[0] ?? null;
}

export function clearTicketRsvpIntent(cookies: Cookies): void {
	for (const { name } of cookies.getAll()) {
		if (name.startsWith(COOKIE_PREFIX)) cookies.delete(name, { path: '/' });
	}
}

/** Drop auto-RSVP tracking when this event intentionally offers no RSVP controls. */
export function discardTicketRsvpIntentsForEvent(
	cookies: Cookies,
	expected: { buyerDid: string; eventUri: string }
): boolean {
	const matches = readIntents(cookies).filter(
		(intent) => intent.buyerDid === expected.buyerDid && intent.eventUri === expected.eventUri
	);
	for (const match of matches) cookies.delete(match.cookieName, { path: '/' });
	return matches.length > 0;
}

export function clearMatchingTicketRsvpIntent(
	cookies: Cookies,
	expected: { buyerDid: string; eventUri: string; checkoutToken: string }
): boolean {
	const cookieName = cookieNameForToken(expected.checkoutToken);
	const match = readIntents(cookies).find(
		(intent) =>
			intent.cookieName === cookieName &&
			intent.buyerDid === expected.buyerDid &&
			intent.eventUri === expected.eventUri &&
			intent.checkoutToken === expected.checkoutToken
	);
	if (!match) return false;
	cookies.delete(cookieName, { path: '/' });
	return true;
}

/** Consume only after the RSVP PUT succeeded (or the viewer was already going). */
export function completeTicketRsvpIntent(
	cookies: Cookies,
	expected: { buyerDid: string; eventUri: string; rsvpRkey: string }
): boolean {
	const matches = readIntents(cookies).filter(
		(intent) =>
			intent.buyerDid === expected.buyerDid &&
			intent.eventUri === expected.eventUri &&
			intent.rsvpRkey === expected.rsvpRkey
	);
	for (const match of matches) cookies.delete(match.cookieName, { path: '/' });
	return matches.length > 0;
}
