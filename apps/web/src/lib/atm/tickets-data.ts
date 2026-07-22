// Server-side loaders for the event page's ATM tickets section.
//
// Best-effort by design: the event page must render identically (minus the
// tickets section) when ATM is unconfigured, the event has no ticket config,
// or ATM is briefly unreachable — callers get `null`, never a thrown error.

import type {
	EventTicketingView,
	OrganizerTicketTermsView,
	TicketTierView,
	ViewerTicketView
} from '@atmo-dev/events-ui';
import { getAtmHandle } from './client';
import { atmConfigured, getAtmConfig } from './config';
import { AtmApiError, type AtmTicketAvailability, type AtmTicketSummary } from './sdk';
import { buildViewerTicketBadges, ticketEventUri } from './ticket-badges';
import type { TicketPurchaseStatus } from './ticket-purchase-intent.server';

type Env = App.Platform['env'];

/** How long availability (including "not ticketed") is served from cache. */
const AVAILABILITY_CACHE_SECONDS = 60;

export type TicketAvailabilityProjection = {
	tiers: TicketTierView[];
	organizerTerms?: OrganizerTicketTermsView;
	organizerTermsError?: string;
};

/**
 * Load everything the tickets section needs for one event page view:
 * tier availability (cached), plus the signed-in viewer's own tickets.
 * Returns `null` when ATM is off or the event is not ATM-ticketed.
 */
export async function loadEventTicketing(
	env: Env,
	eventUri: string,
	viewerDid: string | null,
	purchaseStatus: TicketPurchaseStatus | null
): Promise<EventTicketingView | null> {
	if (!atmConfigured(env)) return null;
	const environment = getAtmConfig(env)!.environment;
	try {
		const availability = await loadAvailabilityProjectionCached(env, eventUri);
		if (!availability || availability.tiers.length === 0) return null;
		const viewerTickets = viewerDid ? await loadViewerTickets(env, eventUri, viewerDid) : [];
		const iconUrl = new URL('/atmosphere-tickets.svg', getAtmConfig(env)!.brokerUrl).toString();
		return {
			environment,
			iconUrl,
			tiers: availability.tiers,
			organizerTerms: availability.organizerTerms,
			organizerTermsError: availability.organizerTermsError,
			viewerTickets,
			purchaseStatus: purchaseStatus ?? undefined
		};
	} catch (e) {
		console.error('[atm] ticket availability load failed:', e);
		return null;
	}
}

// `caches.default` is a Cloudflare extension not in the DOM `CacheStorage`
// type, and is absent in dev (vite/node) — guard + cast (same pattern as the
// event-record cache in the event page's server load).
function defaultCache(): Cache | null {
	return typeof caches !== 'undefined' && 'default' in caches
		? (caches as unknown as { default: Cache }).default
		: null;
}

function availabilityCacheKey(env: Env, eventUri: string): Request {
	const environment = getAtmConfig(env)!.environment;
	return new Request(
		`https://atm-tickets.internal/availability-v2/${environment}/${encodeURIComponent(eventUri)}`
	);
}

/** Drop the cached availability for an event (after a claim consumed capacity). */
export async function invalidateAvailabilityCache(env: Env, eventUri: string): Promise<void> {
	try {
		await defaultCache()?.delete(availabilityCacheKey(env, eventUri));
	} catch (e) {
		// A successful hold/claim must not be reported as failed just because the
		// edge cache could not be evicted. The 60s TTL bounds any stale display,
		// and every mutation still re-fetches ATM authoritatively.
		console.warn('[atm] ticket availability cache invalidation failed:', e);
	}
}

/**
 * Tier availability for an event, via the Cloudflare cache (60s TTL, both
 * positive and "not ticketed" results) so ordinary event-page views do not
 * mint a service-auth token per hit. `null` = event has no ATM ticket config.
 */
export async function loadAvailabilityCached(
	env: Env,
	eventUri: string
): Promise<TicketTierView[] | null> {
	return (await loadAvailabilityProjectionCached(env, eventUri))?.tiers ?? null;
}

async function loadAvailabilityProjectionCached(
	env: Env,
	eventUri: string
): Promise<TicketAvailabilityProjection | null> {
	const cache = defaultCache();
	const cacheKey = availabilityCacheKey(env, eventUri);

	if (cache) {
		const cached = await cache.match(cacheKey);
		if (cached) return (await cached.json()) as TicketAvailabilityProjection | null;
	}

	const availability = await fetchAvailability(env, eventUri);

	if (cache) {
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(availability), {
				headers: {
					'content-type': 'application/json',
					'cache-control': `max-age=${AVAILABILITY_CACHE_SECONDS}`
				}
			})
		);
	}
	return availability;
}

/**
 * Read ATM directly, bypassing the event-page cache. Mutation paths must use
 * this so a tier changing price, sale state, or free/paid status cannot send a
 * buyer down the wrong purchase procedure based on a stale page projection.
 * ATM still performs the final atomic capacity and offer checks.
 */
export async function loadAvailabilityFresh(
	env: Env,
	eventUri: string
): Promise<TicketTierView[] | null> {
	return (await loadTicketAvailabilityFresh(env, eventUri))?.tiers ?? null;
}

/** Full fresh projection used by purchase paths that must enforce current terms. */
export async function loadTicketAvailabilityFresh(
	env: Env,
	eventUri: string
): Promise<TicketAvailabilityProjection | null> {
	return fetchAvailability(env, eventUri);
}

/** Uncached availability read; `null` when the event is not ATM-ticketed. */
async function fetchAvailability(
	env: Env,
	eventUri: string
): Promise<TicketAvailabilityProjection | null> {
	const handle = await getAtmHandle(env);
	if (!handle) return null;
	try {
		const availability = await handle.atm.getTicketAvailability({
			environment: handle.environment,
			eventUri
		});
		const tiers = toTierViews(availability);
		if (!tiers) return null;
		const organizerTerms = toOrganizerTerms(availability);
		return {
			tiers,
			...(organizerTerms.kind === 'valid' ? { organizerTerms: organizerTerms.terms } : {}),
			...(organizerTerms.kind === 'invalid' ? { organizerTermsError: organizerTerms.message } : {})
		};
	} catch (e) {
		// EventNotFound = the organizer never configured ATM tickets for this
		// event — the common case, cached like any other result.
		if (e instanceof AtmApiError && e.code === 'EventNotFound') return null;
		throw e;
	} finally {
		await handle.flush();
	}
}

function toOrganizerTerms(
	availability: AtmTicketAvailability
):
	| { kind: 'absent' }
	| { kind: 'valid'; terms: OrganizerTicketTermsView }
	| { kind: 'invalid'; message: string } {
	const terms = availability.event?.organizerTerms;
	if (!terms) return { kind: 'absent' };
	if (typeof terms.url !== 'string') {
		return {
			kind: 'invalid',
			message: 'The organizer’s terms are unavailable. Refresh the page or contact the organizer.'
		};
	}
	try {
		const url = new URL(terms.url);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			return {
				kind: 'invalid',
				message: 'The organizer’s terms link is invalid. Contact the organizer before purchasing.'
			};
		}
		const label = typeof terms.label === 'string' ? terms.label.trim() : '';
		const version = typeof terms.version === 'string' ? terms.version.trim() : '';
		if (!version) {
			return {
				kind: 'invalid',
				message:
					'The organizer’s terms need to be refreshed before checkout. Please try again shortly.'
			};
		}
		return {
			kind: 'valid',
			terms: {
				url: url.toString(),
				version,
				...(label ? { label } : {})
			}
		};
	} catch {
		return {
			kind: 'invalid',
			message: 'The organizer’s terms link is invalid. Contact the organizer before purchasing.'
		};
	}
}

function toTierViews(availability: AtmTicketAvailability): TicketTierView[] | null {
	const tiers = (availability.tiers ?? [])
		.filter((tier) => tier.status !== 'hidden')
		.map(
			(tier): TicketTierView => ({
				tierId: String(tier.tierId ?? ''),
				title: String(tier.title ?? 'Ticket'),
				description: typeof tier.description === 'string' ? tier.description : undefined,
				currency: typeof tier.currency === 'string' ? tier.currency : undefined,
				unitAmount: typeof tier.unitAmount === 'number' ? tier.unitAmount : undefined,
				status: String(tier.status ?? 'unavailable'),
				availableQuantity: typeof tier.availableQuantity === 'number' ? tier.availableQuantity : 0,
				maxPerOrder: typeof tier.maxPerOrder === 'number' ? tier.maxPerOrder : 1,
				saleStartsAt: typeof tier.saleStartsAt === 'string' ? tier.saleStartsAt : undefined,
				saleEndsAt: typeof tier.saleEndsAt === 'string' ? tier.saleEndsAt : undefined
			})
		)
		.filter((tier) => tier.tierId);
	return tiers.length > 0 ? tiers : null;
}

/**
 * The signed-in viewer's issued tickets for this event (app-scoped: ATM only
 * returns tickets this app originated). Uncached — per-user data.
 */
export async function loadViewerTickets(
	env: Env,
	eventUri: string,
	viewerDid: string
): Promise<ViewerTicketView[]> {
	try {
		const tickets = await listAllBuyerTickets(env, viewerDid);
		return tickets
			.filter((ticket) => {
				return ticketEventUri(ticket) === eventUri;
			})
			.map(toViewerTicket)
			.filter((ticket) => ticket.id);
	} catch (e) {
		console.error('[atm] listBuyerTickets failed:', e);
		return [];
	}
}

/**
 * Return the minimal event → Atmosphere Tickets icon map needed by Calendar.
 * The ATM response also contains private pass URLs; those are discarded and
 * never serialized into calendar page data.
 */
export async function loadViewerTicketBadges(
	env: Env,
	viewerDid: string
): Promise<Record<string, string>> {
	try {
		const config = getAtmConfig(env);
		if (!config) return {};
		const fallbackIconUrl = new URL('/atmosphere-tickets.svg', config.brokerUrl).toString();
		return buildViewerTicketBadges(await listAllBuyerTickets(env, viewerDid), fallbackIconUrl);
	} catch (e) {
		// Ticket decoration is additive. Calendar remains fully usable during an
		// ATM outage and will show the icon again on the next successful load.
		console.error('[atm] calendar ticket badges load failed:', e);
		return {};
	}
}

/** Follow ATM's opaque cursor, de-duplicating defensively across pages. */
async function listAllBuyerTickets(env: Env, viewerDid: string): Promise<AtmTicketSummary[]> {
	const handle = await getAtmHandle(env);
	if (!handle) throw new Error('ATM is not configured');

	const tickets: AtmTicketSummary[] = [];
	const seenTicketIds = new Set<string>();
	const seenCursors = new Set<string>();
	let cursor: string | undefined;

	try {
		// The route caps pages at 100 rows. The outer bound is a safety guard
		// against a broken/repeating upstream cursor, not a normal product limit.
		for (let page = 0; page < 100; page += 1) {
			const result = await handle.atm.listBuyerTickets({
				environment: handle.environment,
				buyerDid: viewerDid,
				limit: 100,
				...(cursor ? { cursor } : {})
			});
			for (const ticket of result.tickets ?? []) {
				const id = stringValue(ticket.id ?? ticket.ticketId);
				if (!id || seenTicketIds.has(id)) continue;
				seenTicketIds.add(id);
				tickets.push(ticket);
			}

			const nextCursor = stringValue(result.cursor);
			if (!nextCursor || seenCursors.has(nextCursor)) break;
			seenCursors.add(nextCursor);
			cursor = nextCursor;
		}
		return tickets;
	} finally {
		await handle.flush();
	}
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function ticketTierTitle(ticket: AtmTicketSummary): string | undefined {
	return stringValue(ticket.tier?.title) ?? stringValue(ticket.presentation?.tier?.title);
}

function toViewerTicket(ticket: AtmTicketSummary): ViewerTicketView {
	const status = stringValue(ticket.status) ?? 'active';
	const scanUrl = stringValue(ticket.scanUrl);
	return {
		id: stringValue(ticket.id ?? ticket.ticketId) ?? '',
		ticketNumber: stringValue(ticket.ticketNumber) ?? '',
		status,
		tierTitle: ticketTierTitle(ticket),
		...(status === 'active' && scanUrl ? { scanUrl } : {})
	};
}
