export type TicketActionState = 'open' | 'closed' | 'unknown';
export type TicketDiscoveryState = 'found' | 'none' | 'unavailable';

const ATMOSPHERE_TICKETS_ORIGIN = 'https://events.atmosphere.tickets';
const CANCELLED_EVENT_STATUS = 'community.lexicon.calendar.event#cancelled';
const DID_PATTERN = /^did:[a-z0-9]+:(?:[a-zA-Z0-9._:-]|%[0-9a-fA-F]{2})+$/;

/** Normalize an event link for rendering. Event records are untrusted input. */
export function sanitizeWebUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.trim().length === 0) return null;

	try {
		const url = new URL(value.trim());
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		if (url.username || url.password) return null;
		return url.href;
	} catch {
		return null;
	}
}

/**
 * Accept only the canonical hosted event route. When an event identity is
 * supplied, the URL must point to that exact event rather than merely sharing
 * Atmosphere Tickets' origin.
 */
export function isAtmosphereTicketsEventUrl(
	value: unknown,
	eventDid?: string,
	eventRkey?: string
): boolean {
	const href = sanitizeWebUrl(value);
	if (!href) return false;

	const url = new URL(href);
	if (url.origin !== ATMOSPHERE_TICKETS_ORIGIN || url.search || url.hash) return false;
	const match = url.pathname.match(/^\/p\/([^/]+)\/e\/([^/]+)$/);
	if (!match) return false;

	try {
		const actor = decodeURIComponent(match[1]);
		const rkey = decodeURIComponent(match[2]);
		if (!DID_PATTERN.test(actor) || !/^[a-zA-Z0-9._:~-]{1,512}$/.test(rkey)) {
			return false;
		}
		return (
			(eventDid === undefined || actor === eventDid) &&
			(eventRkey === undefined || rkey === eventRkey)
		);
	} catch {
		return false;
	}
}

/** Require a canonical Tickets route for the exact calendar event AT-URI. */
export function isAtmosphereTicketsUrlForEvent(value: unknown, eventUri: string): boolean {
	const event = eventUri.match(
		/^at:\/\/(did:[a-z0-9]+:(?:[a-zA-Z0-9._:-]|%[0-9a-fA-F]{2})+)\/community\.lexicon\.calendar\.event\/([a-zA-Z0-9._:~-]{1,512})$/
	);
	return (
		!!event && DID_PATTERN.test(event[1]) && isAtmosphereTicketsEventUrl(value, event[1], event[2])
	);
}

/** Return a known event end boundary, or null when the event has no usable end. */
export function getTicketSalesEndTimestamp(startsAt: unknown, endsAt: unknown): number | null {
	if (!isValidDate(startsAt) || endsAt === undefined || endsAt === null) return null;
	if (!isValidDate(endsAt)) return null;
	return Date.parse(endsAt);
}

/**
 * Separate an ended event from an event whose public dates are malformed.
 * Unknown timing falls back to ordinary RSVP presentation; it must not make
 * the complete attendance surface disappear.
 */
export function getTicketActionState({
	startsAt,
	endsAt,
	status,
	now = Date.now()
}: {
	startsAt: unknown;
	endsAt?: unknown;
	status?: unknown;
	now?: number;
}): TicketActionState {
	if (status === CANCELLED_EVENT_STATUS) return 'closed';
	if (!Number.isFinite(now) || !isValidDate(startsAt)) return 'unknown';
	if (endsAt === undefined || endsAt === null) return 'open';
	if (!isValidDate(endsAt)) return 'unknown';
	return Date.parse(endsAt) > now ? 'open' : 'closed';
}

export function isTicketCtaEligible({
	startsAt,
	endsAt,
	status,
	now = Date.now()
}: {
	startsAt: unknown;
	endsAt?: unknown;
	status?: unknown;
	now?: number;
}): boolean {
	return getTicketActionState({ startsAt, endsAt, status, now }) === 'open';
}

/**
 * Admission policy is configured separately from ticket discovery. A
 * ticketedEvent backlink never enables policy by itself; an explicit policy
 * may suppress the competing signed-out RSVP prompt only while discovery has
 * found the CTA. A clean no-record or unavailable result restores that prompt.
 */
export function shouldShowRsvpPanel({
	isLoggedIn,
	ticketAdmissionRequired,
	ticketActionState = 'open',
	ticketDiscoveryState = 'none'
}: {
	isLoggedIn: boolean;
	ticketAdmissionRequired: boolean;
	ticketActionState?: TicketActionState;
	ticketDiscoveryState?: TicketDiscoveryState;
}): boolean {
	return (
		isLoggedIn ||
		!ticketAdmissionRequired ||
		ticketActionState === 'unknown' ||
		ticketDiscoveryState !== 'found'
	);
}

/**
 * Show the special ticket CTA only for the canonical URL supplied by verified
 * protocol discovery. Organizer-authored links are ordinary event links: they
 * are never promoted or removed, even when labelled "Tickets" or when they
 * happen to point at the same page.
 */
export function resolveTicketPresentation({
	protocolTicketUrl,
	eventDid,
	eventRkey,
	showCta
}: {
	protocolTicketUrl?: unknown;
	eventDid: string;
	eventRkey: string;
	showCta: boolean;
}): string | null {
	if (!showCta) return null;

	const protocolHref = sanitizeWebUrl(protocolTicketUrl);
	if (!protocolHref || !isAtmosphereTicketsEventUrl(protocolHref, eventDid, eventRkey)) {
		return null;
	}

	return protocolHref;
}

function isValidDate(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
