import { createHash } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getSignedCookie, setSignedCookie } from '$lib/atproto/server/signed-cookie';

const COOKIE_PREFIX = 'atm_ticket_purchase_';
const INTENT_TTL_MS = 60 * 60 * 1_000;
const MAX_INTENTS = 6;

export type TicketPurchaseStatus = 'processing' | 'confirmed';

export type TicketPurchaseIntent = {
	eventUri: string;
	checkoutToken: string;
	/** `started` is never rendered; result states are written only after ATM is queried server-side. */
	status: 'started' | TicketPurchaseStatus;
	createdAt: number;
};

type NamedIntent = TicketPurchaseIntent & { cookieName: string };

function cookieNameForToken(checkoutToken: string): string {
	const digest = createHash('sha256').update(checkoutToken).digest('hex').slice(0, 24);
	return `${COOKIE_PREFIX}${digest}`;
}

function isValidIntent(value: unknown, now = Date.now()): value is TicketPurchaseIntent {
	if (!value || typeof value !== 'object') return false;
	const intent = value as Partial<TicketPurchaseIntent>;
	return (
		typeof intent.eventUri === 'string' &&
		intent.eventUri.length > 0 &&
		typeof intent.checkoutToken === 'string' &&
		intent.checkoutToken.length > 0 &&
		(intent.status === 'started' ||
			intent.status === 'processing' ||
			intent.status === 'confirmed') &&
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
			// Ignore malformed or stale cookies; browser expiry is the backstop.
		}
	}
	return intents.sort((a, b) => b.createdAt - a.createdAt);
}

function writeIntent(cookies: Cookies, intent: TicketPurchaseIntent, secure: boolean): void {
	setSignedCookie(cookies, cookieNameForToken(intent.checkoutToken), JSON.stringify(intent), {
		httpOnly: true,
		maxAge: INTENT_TTL_MS / 1_000,
		path: '/',
		sameSite: 'lax',
		secure
	});
}

/**
 * Bind an ATM checkout token to the event before redirecting. This is set for
 * signed-in and guest buyers alike, so a later query string is only a lookup
 * hint and can never create a purchase-success state by itself.
 */
export function setTicketPurchaseIntent(
	cookies: Cookies,
	intent: Pick<TicketPurchaseIntent, 'eventUri' | 'checkoutToken'>,
	secure: boolean
): TicketPurchaseIntent {
	const stored: TicketPurchaseIntent = {
		...intent,
		status: 'started',
		createdAt: Date.now()
	};
	writeIntent(cookies, stored, secure);

	const currentName = cookieNameForToken(stored.checkoutToken);
	const existing = readIntents(cookies).filter((item) => item.cookieName !== currentName);
	for (const stale of existing.slice(MAX_INTENTS - 1)) {
		cookies.delete(stale.cookieName, { path: '/' });
	}
	return stored;
}

export function getTicketPurchaseIntent(
	cookies: Cookies,
	expected: { eventUri: string; checkoutToken: string }
): TicketPurchaseIntent | null {
	const cookieName = cookieNameForToken(expected.checkoutToken);
	const match = readIntents(cookies).find(
		(intent) =>
			intent.cookieName === cookieName &&
			intent.eventUri === expected.eventUri &&
			intent.checkoutToken === expected.checkoutToken
	);
	if (!match) return null;
	const intent = { ...match } as Partial<NamedIntent>;
	delete intent.cookieName;
	return intent as TicketPurchaseIntent;
}

/** Write a renderable result only after the caller has queried ATM server-side. */
export function markTicketPurchaseResult(
	cookies: Cookies,
	expected: { eventUri: string; checkoutToken: string },
	status: TicketPurchaseStatus,
	secure: boolean
): boolean {
	const intent = getTicketPurchaseIntent(cookies, expected);
	if (!intent) return false;
	writeIntent(cookies, { ...intent, status }, secure);
	return true;
}

export function clearMatchingTicketPurchaseIntent(
	cookies: Cookies,
	expected: { eventUri: string; checkoutToken: string }
): boolean {
	const intent = getTicketPurchaseIntent(cookies, expected);
	if (!intent) return false;
	cookies.delete(cookieNameForToken(expected.checkoutToken), { path: '/' });
	return true;
}

/**
 * Consume the newest server-verified result for this event. Plain `started`
 * intents are deliberately invisible, including when someone forges return
 * query parameters without completing the server verification step.
 */
export function consumeTicketPurchaseResult(
	cookies: Cookies,
	eventUri: string
): TicketPurchaseStatus | null {
	const matches = readIntents(cookies).filter(
		(intent) => intent.eventUri === eventUri && intent.status !== 'started'
	);
	for (const match of matches) cookies.delete(match.cookieName, { path: '/' });
	return matches[0]?.status === 'processing' || matches[0]?.status === 'confirmed'
		? matches[0].status
		: null;
}
