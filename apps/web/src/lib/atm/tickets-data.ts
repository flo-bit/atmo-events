// Server-side loaders for the event page's ATM tickets section.
//
// Best-effort by design: the event page must render identically (minus the
// tickets section) when ATM is unconfigured, the event has no ticket config,
// or ATM is briefly unreachable — callers get `null`, never a thrown error.

import type { EventTicketingView, TicketTierView, ViewerTicketView } from '@atmo-dev/events-ui';
import { getAtmHandle } from './client';
import { atmConfigured, getAtmConfig } from './config';
import { AtmApiError, type AtmTicketAvailability } from './sdk';

type Env = App.Platform['env'];

/** How long availability (including "not ticketed") is served from cache. */
const AVAILABILITY_CACHE_SECONDS = 60;

/**
 * Load everything the tickets section needs for one event page view:
 * tier availability (cached), plus the signed-in viewer's own tickets.
 * Returns `null` when ATM is off or the event is not ATM-ticketed.
 */
export async function loadEventTicketing(
	env: Env,
	eventUri: string,
	viewerDid: string | null,
	justPurchased: boolean
): Promise<EventTicketingView | null> {
	if (!atmConfigured(env)) return null;
	const environment = getAtmConfig(env)!.environment;
	try {
		const tiers = await loadAvailabilityCached(env, eventUri);
		if (!tiers || tiers.length === 0) return null;
		const viewerTickets = viewerDid ? await loadViewerTickets(env, eventUri, viewerDid) : [];
		return { environment, tiers, viewerTickets, justPurchased };
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
		`https://atm-tickets.internal/availability/${environment}/${encodeURIComponent(eventUri)}`
	);
}

/** Drop the cached availability for an event (after a claim consumed capacity). */
export async function invalidateAvailabilityCache(env: Env, eventUri: string): Promise<void> {
	await defaultCache()?.delete(availabilityCacheKey(env, eventUri));
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
	const cache = defaultCache();
	const cacheKey = availabilityCacheKey(env, eventUri);

	if (cache) {
		const cached = await cache.match(cacheKey);
		if (cached) return (await cached.json()) as TicketTierView[] | null;
	}

	const tiers = await fetchAvailability(env, eventUri);

	if (cache) {
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(tiers), {
				headers: {
					'content-type': 'application/json',
					'cache-control': `max-age=${AVAILABILITY_CACHE_SECONDS}`
				}
			})
		);
	}
	return tiers;
}

/** Uncached availability read; `null` when the event is not ATM-ticketed. */
async function fetchAvailability(env: Env, eventUri: string): Promise<TicketTierView[] | null> {
	const handle = await getAtmHandle(env);
	if (!handle) return null;
	try {
		const availability = await handle.atm.getTicketAvailability({
			environment: handle.environment,
			eventUri
		});
		return toTierViews(availability);
	} catch (e) {
		// EventNotFound = the organizer never configured ATM tickets for this
		// event — the common case, cached like any other result.
		if (e instanceof AtmApiError && e.code === 'EventNotFound') return null;
		throw e;
	} finally {
		await handle.flush();
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
				maxPerOrder: typeof tier.maxPerOrder === 'number' ? tier.maxPerOrder : 1
			})
		)
		.filter((tier) => tier.tierId);
	return tiers.length > 0 ? tiers : null;
}

/**
 * The signed-in viewer's issued tickets for this event (app-scoped: ATM only
 * returns tickets this app originated). Uncached — per-user data.
 */
async function loadViewerTickets(
	env: Env,
	eventUri: string,
	viewerDid: string
): Promise<ViewerTicketView[]> {
	const handle = await getAtmHandle(env);
	if (!handle) return [];
	try {
		const result = await handle.atm.listBuyerTickets({
			environment: handle.environment,
			buyerDid: viewerDid,
			limit: 100
		});
		return (result.tickets ?? [])
			.filter((ticket) => {
				const event = ticket.event as { uri?: string } | undefined;
				return event?.uri === eventUri;
			})
			.map(
				(ticket): ViewerTicketView => ({
					id: String(ticket.id ?? ticket.ticketId ?? ''),
					ticketNumber: String(ticket.ticketNumber ?? ''),
					status: String(ticket.status ?? 'active'),
					tierTitle:
						typeof (ticket.tier as { title?: string } | undefined)?.title === 'string'
							? (ticket.tier as { title: string }).title
							: undefined,
					scanUrl: typeof ticket.scanUrl === 'string' ? ticket.scanUrl : undefined
				})
			)
			.filter((ticket) => ticket.id);
	} catch (e) {
		console.error('[atm] listBuyerTickets failed:', e);
		return [];
	} finally {
		await handle.flush();
	}
}
