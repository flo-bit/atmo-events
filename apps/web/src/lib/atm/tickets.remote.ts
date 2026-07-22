import { error, isHttpError } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import type { Client } from '@atcute/client';
import type { Did, Nsid } from '@atcute/lexicons';
import { getAtmHandle } from './client';
import { atmConfigured, getAtmConfig } from './config';
import {
	invalidateAvailabilityCache,
	loadTicketAvailabilityFresh,
	loadViewerTickets
} from './tickets-data';
import { AtmApiError, ATM_XRPC_METHODS } from './sdk';
import {
	clearMatchingTicketRsvpIntent,
	completeTicketRsvpIntent,
	getTicketRsvpIntents,
	setTicketRsvpIntent
} from './ticket-rsvp-intent.server';
import { setTicketPurchaseIntent } from './ticket-purchase-intent.server';
import { hasActiveViewerTicket } from './ticket-rsvp';
import { normalizeTicketOrderPreview } from './ticket-order-preview';
import { resolveOrganizerTermsAcceptance } from './ticket-organizer-terms';

const eventUriSchema = v.pipe(
	v.string(),
	v.regex(
		/^at:\/\/did:[a-z0-9]+:[^/]+\/community\.lexicon\.calendar\.event\/[a-zA-Z0-9._:~-]{1,512}$/,
		'eventUri must be an at:// community.lexicon.calendar.event URI'
	)
);

/**
 * Non-reserving price quote for the app-native picker. This is deliberately
 * separate from `buyTickets`: Apply never consumes inventory, and the later
 * hold atomically revalidates both the offer and current price.
 */
export const previewTicketOrder = command(
	v.object({
		eventUri: eventUriSchema,
		tierId: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
		quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
		offerCode: v.optional(v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(64)))
	}),
	async (input) => {
		const { platform } = getRequestEvent();
		const env = platform?.env;
		if (!env || !atmConfigured(env)) error(400, 'Ticketing is not configured');

		const handle = await getAtmHandle(env);
		if (!handle) error(400, 'Ticketing is not configured');
		try {
			return normalizeTicketOrderPreview(
				await handle.atm.previewTicketOrder({
					environment: handle.environment,
					eventUri: input.eventUri,
					tierId: input.tierId,
					quantity: input.quantity,
					...(input.offerCode ? { offerCode: input.offerCode } : {})
				})
			);
		} catch (e) {
			if (isHttpError(e)) throw e;
			if (e instanceof AtmApiError) error(e.status >= 500 ? 502 : 400, friendlyAtmError(e));
			console.error('[atm] ticket order preview failed:', e);
			error(502, 'Ticket pricing is temporarily unavailable — please try again.');
		} finally {
			await handle.flush();
		}
	}
);

/**
 * Buy (or, for a free tier, claim) ATM tickets for an event.
 *
 * Paid tiers: creates an ATM ticket hold — capacity is reserved before any
 * payment — and returns the ATM-hosted checkout URL for a client-side
 * redirect. Tickets are issued by ATM only after payment settles (the
 * `tickets.issued` webhook / the buyer's return to `?tickets=success`).
 *
 * Free tiers: claims capacity transactionally via ATM's dedicated zero-price
 * path (`claimFreeTicket`) — no checkout, tickets are issued immediately.
 *
 * Signed-in paid buyers and all free claims attach a short-lived buyer
 * assertion minted by the user's own PDS. Paid buyers may also check out as
 * guests: no DID hint is sent, and ATM-hosted checkout collects the delivery
 * email. ATM refuses to treat a bare, unasserted DID hint as buyer identity.
 */
export const buyTickets = command(
	v.object({
		eventUri: eventUriSchema,
		tierId: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
		quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
		offerCode: v.optional(v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(64))),
		/** Client supplies only the decision; current terms content comes from ATM server-side. */
		organizerTermsAccepted: v.optional(v.boolean()),
		/** Opaque revision displayed next to the accepted organizer terms. */
		organizerTermsVersion: v.optional(
			v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300))
		),
		intentId: v.pipe(
			v.string(),
			v.regex(/^[A-Za-z0-9._~-]{16,100}$/, 'intentId must be a stable client-generated ID')
		)
	}),
	async (
		input
	): Promise<{ kind: 'checkout'; url: string } | { kind: 'claimed'; count: number }> => {
		const { cookies, locals, platform, url } = getRequestEvent();
		const env = platform?.env;
		if (!env || !atmConfigured(env)) error(400, 'Ticketing is not configured');

		try {
			// The event page intentionally caches this projection, but the mutation
			// path must decide free-vs-paid from ATM's current state. ATM then fences
			// inventory, offer eligibility, and limits again inside hold/claim.
			const availability = await loadTicketAvailabilityFresh(env, input.eventUri);
			if (!availability) error(400, 'That ticket tier is no longer available.');
			const tier = availability.tiers.find((t) => t.tierId === input.tierId);
			if (!tier) error(400, 'That ticket tier is no longer available.');
			if (availability.organizerTermsError) {
				error(409, availability.organizerTermsError);
			}
			const organizerTermsAcceptance = resolveOrganizerTermsAcceptance(
				availability.organizerTerms,
				input.organizerTermsAccepted,
				input.organizerTermsVersion
			);
			if (!organizerTermsAcceptance.ok) {
				if (organizerTermsAcceptance.reason === 'version-mismatch') {
					error(409, 'The organizer’s terms changed. Refresh the page and review them again.');
				}
				error(400, 'Accept the organizer’s terms before continuing.');
			}
			const organizerTermsMetadata = organizerTermsAcceptance.metadata;
			if (tier.status !== 'available' || tier.availableQuantity < input.quantity) {
				error(400, 'That quantity is no longer available.');
			}
			if (input.quantity > tier.maxPerOrder) {
				error(400, `You can buy up to ${tier.maxPerOrder} of this ticket per order.`);
			}
			if (typeof tier.unitAmount !== 'number') {
				error(400, 'Pricing for that ticket is temporarily unavailable.');
			}
			const idempotencyKey = `atmo-rsvp:${input.intentId}`;

			const handle = await getAtmHandle(env);
			if (!handle) error(400, 'Ticketing is not configured');

			// The event page lives at /p/<actor>/e/<rkey>; the DID authority from
			// the AT-URI routes there too, so checkout returns straight to it.
			const [, did, rkey] = input.eventUri.match(/^at:\/\/([^/]+)\/[^/]+\/(.+)$/)!;
			const eventPageUrl = `${url.origin}/p/${did}/e/${rkey}`;
			const returnUrl = new URL(eventPageUrl);
			returnUrl.searchParams.set('tickets', 'success');
			const cancelUrl = new URL(eventPageUrl);
			cancelUrl.searchParams.set('tickets', 'cancelled');

			try {
				if (tier.unitAmount === 0) {
					if (!locals.client || !locals.did) {
						error(401, 'Sign in to claim free tickets.');
					}
					// Free tier: ATM's transactional zero-price claim path.
					const buyerAssertionJwt = await mintBuyerAssertion(
						locals.client,
						ATM_XRPC_METHODS.tickets.claimFreeTicket,
						getAtmConfig(env)!.serviceAudience
					);
					const claim = await handle.atm.claimFreeTicket({
						environment: handle.environment,
						eventUri: input.eventUri,
						buyerDid: locals.did,
						buyerAssertionJwt,
						items: [{ tierId: input.tierId, quantity: input.quantity }],
						idempotencyKey,
						...(organizerTermsMetadata ? { metadata: organizerTermsMetadata } : {})
					});
					await invalidateAvailabilityCache(env, input.eventUri);
					return { kind: 'claimed', count: claim.tickets?.length ?? input.quantity };
				}

				// Paid checkout supports guests. When a buyer is signed in, attach a
				// PDS-minted assertion so ATM can issue the ticket to that DID; when
				// signed out, omit both identity fields and let ATM-hosted checkout
				// collect the delivery email.
				let buyerIdentity: { buyerDid?: string; buyerAssertionJwt?: string } = {};
				if (locals.client && locals.did) {
					buyerIdentity = {
						buyerDid: locals.did,
						buyerAssertionJwt: await mintBuyerAssertion(
							locals.client,
							ATM_XRPC_METHODS.payment.assertPayer,
							getAtmConfig(env)!.serviceAudience
						)
					};
				}
				const hold = await handle.atm.createTicketHold({
					environment: handle.environment,
					eventUri: input.eventUri,
					...buyerIdentity,
					...(input.offerCode ? { offerCode: input.offerCode } : {}),
					items: [{ tierId: input.tierId, quantity: input.quantity }],
					returnUrl: returnUrl.toString(),
					cancelUrl: cancelUrl.toString(),
					idempotencyKey,
					...(organizerTermsMetadata ? { metadata: organizerTermsMetadata } : {})
				});
				if (!hold.url) error(502, 'ATM did not return a checkout URL');
				if (!hold.token) error(502, 'ATM did not return a checkout token');
				await invalidateAvailabilityCache(env, input.eventUri);
				// Every checkout, including a guest checkout, gets a signed HTTP-only
				// return intent. The return query is only a lookup hint; the event page
				// must match this intent and query ATM before it can render a result.
				setTicketPurchaseIntent(
					cookies,
					{ eventUri: input.eventUri, checkoutToken: hold.token },
					url.protocol === 'https:'
				);
				if (buyerIdentity.buyerDid) {
					setTicketRsvpIntent(
						cookies,
						{
							buyerDid: buyerIdentity.buyerDid,
							eventUri: input.eventUri,
							checkoutToken: hold.token
						},
						url.protocol === 'https:'
					);
				}
				return { kind: 'checkout', url: hold.url };
			} finally {
				await handle.flush();
			}
		} catch (e) {
			if (isHttpError(e)) throw e; // re-throw SvelteKit errors
			if (e instanceof AtmApiError) error(e.status >= 500 ? 502 : 400, friendlyAtmError(e));
			console.error('[atm] buyTickets failed:', e);
			error(502, 'Ticketing is temporarily unavailable — please try again.');
		}
	}
);

/**
 * Confirm the exact signed-in checkout saved in the HTTP-only purchase intent.
 * The client polls this after immediately removing the bearer token from its URL.
 */
export const confirmTicketRsvpPurchase = command(
	v.object({ eventUri: eventUriSchema }),
	async (
		input
	): Promise<
		{ status: 'pending' | 'failed' | 'not-found' } | { status: 'issued'; rsvpRkey: string }
	> => {
		const { cookies, locals, platform } = getRequestEvent();
		const env = platform?.env;
		if (!locals.client || !locals.did) return { status: 'not-found' };
		if (!env || !atmConfigured(env)) return { status: 'not-found' };

		const intents = getTicketRsvpIntents(cookies, {
			buyerDid: locals.did,
			eventUri: input.eventUri
		});
		if (intents.length === 0) return { status: 'not-found' };

		const handle = await getAtmHandle(env);
		if (!handle) return { status: 'not-found' };
		let completedIntent: (typeof intents)[number] | undefined;
		let sawPending = false;
		let sawFailed = false;
		try {
			for (const intent of intents) {
				try {
					const payment = await handle.atm.getPaymentStatus(intent.checkoutToken);
					if (payment.status === 'completed') {
						completedIntent = intent;
						break;
					}
					if (payment.status === 'failed') {
						sawFailed = true;
						clearMatchingTicketRsvpIntent(cookies, {
							buyerDid: locals.did,
							eventUri: input.eventUri,
							checkoutToken: intent.checkoutToken
						});
					} else {
						sawPending = true;
					}
				} catch (e) {
					if (e instanceof AtmApiError && e.status === 404) {
						sawFailed = true;
						clearMatchingTicketRsvpIntent(cookies, {
							buyerDid: locals.did,
							eventUri: input.eventUri,
							checkoutToken: intent.checkoutToken
						});
						continue;
					}
					console.warn('[atm] ticket RSVP payment confirmation failed:', e);
					sawPending = true;
				}
			}
		} finally {
			await handle.flush();
		}
		if (!completedIntent) {
			if (sawPending) return { status: 'pending' };
			return { status: sawFailed ? 'failed' : 'not-found' };
		}

		const viewerTickets = await loadViewerTickets(env, input.eventUri, locals.did);
		if (!hasActiveViewerTicket({ viewerTickets })) return { status: 'pending' };

		// Keep the durable intent until the client confirms that its PDS RSVP PUT
		// succeeded (or that it was already going).
		return { status: 'issued', rsvpRkey: completedIntent.rsvpRkey };
	}
);

/** Acknowledge the RSVP write and only then consume its durable purchase intent. */
export const completeTicketRsvpPurchase = command(
	v.object({
		eventUri: eventUriSchema,
		rsvpRkey: v.pipe(v.string(), v.regex(/^[a-zA-Z0-9._:~-]{1,512}$/))
	}),
	async (input): Promise<{ cleared: boolean }> => {
		const { cookies, locals } = getRequestEvent();
		if (!locals.did) return { cleared: false };
		return {
			cleared: completeTicketRsvpIntent(cookies, {
				buyerDid: locals.did,
				eventUri: input.eventUri,
				rsvpRkey: input.rsvpRkey
			})
		};
	}
);

/** Mint a short-lived buyer assertion from the signed-in user's PDS.
 *  Requires the matching `rpc?lxm=…&aud=*` OAuth scope (see atproto/settings.ts). */
async function mintBuyerAssertion(client: Client, lxm: string, aud: string): Promise<string> {
	const res = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: aud as Did, lxm: lxm as Nsid }
	});
	if (!res.ok) {
		// Sessions created before the ATM scopes were added can't mint this token.
		error(401, 'Could not authorize the purchase — try signing out and back in.');
	}
	return res.data.token;
}

/** Map ATM error codes to buyer-friendly messages (fall back to ATM's own). */
function friendlyAtmError(e: AtmApiError): string {
	switch (e.code) {
		case 'SoldOut':
		case 'TierSoldOut':
		case 'InsufficientAvailability':
			return 'Sold out — those tickets are no longer available.';
		case 'RecipientNotPayable':
			return 'The organizer has not finished payment setup yet.';
		case 'TicketsModuleDisabled':
		case 'AppNotRegistered':
			return 'Ticketing is not fully configured for this site yet.';
		case 'EventNotFound':
		case 'TierNotFound':
			return 'That ticket tier is no longer available.';
		default:
			return e.message || 'The ticket purchase could not be started.';
	}
}
