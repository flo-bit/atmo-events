export type TicketPresentation = {
	href: string;
};

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

/**
 * Return the instant after which the protocol ticket CTA must be hidden.
 * Invalid public record dates fail closed rather than advertising tickets
 * indefinitely.
 */
export function getTicketSalesEndTimestamp(startsAt: unknown, endsAt: unknown): number | null {
	const value = endsAt ?? startsAt;
	if (typeof value !== 'string' || value.trim().length === 0) return null;

	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
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
	const salesEnd = getTicketSalesEndTimestamp(startsAt, endsAt);
	return (
		salesEnd !== null && Number.isFinite(now) && salesEnd > now && status !== CANCELLED_EVENT_STATUS
	);
}

/**
 * Admission policy is supplied independently from ticket discovery. A
 * ticketedEvent backlink may show the CTA, but only explicit app/organizer
 * policy may suppress the competing signed-out RSVP prompt.
 */
export function shouldShowRsvpPanel({
	isLoggedIn,
	ticketAdmissionRequired
}: {
	isLoggedIn: boolean;
	ticketAdmissionRequired: boolean;
}): boolean {
	return isLoggedIn || !ticketAdmissionRequired;
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
}): TicketPresentation | null {
	if (!showCta) return null;

	const protocolHref = sanitizeWebUrl(protocolTicketUrl);
	if (!protocolHref || !isAtmosphereTicketsEventUrl(protocolHref, eventDid, eventRkey)) {
		return null;
	}

	return { href: protocolHref };
}
