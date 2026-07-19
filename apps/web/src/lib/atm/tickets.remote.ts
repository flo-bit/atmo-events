import { error, isHttpError } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import type { Client } from '@atcute/client';
import type { Did, Nsid } from '@atcute/lexicons';
import { getAtmHandle } from './client';
import { atmConfigured, getAtmConfig } from './config';
import { invalidateAvailabilityCache, loadAvailabilityCached } from './tickets-data';
import { AtmApiError, ATM_XRPC_METHODS } from './sdk';

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
 * Both paths attach a short-lived buyer assertion minted by the signed-in
 * user's own PDS, proving to ATM that this buyer was present — ATM refuses to
 * treat a bare DID hint as authenticated buyer identity.
 */
export const buyTickets = command(
	v.object({
		eventUri: v.pipe(
			v.string(),
			v.regex(
				/^at:\/\/did:[a-z0-9]+:[^/]+\/community\.lexicon\.calendar\.event\/[a-zA-Z0-9._:~-]{1,512}$/,
				'eventUri must be an at:// community.lexicon.calendar.event URI'
			)
		),
		tierId: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
		quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))
	}),
	async (
		input
	): Promise<{ kind: 'checkout'; url: string } | { kind: 'claimed'; count: number }> => {
		const { locals, platform, url } = getRequestEvent();
		const env = platform?.env;
		if (!env || !atmConfigured(env)) error(400, 'Ticketing is not configured');
		if (!locals.client || !locals.did) error(401, 'Not signed in');

		try {
			const tiers = await loadAvailabilityCached(env, input.eventUri);
			const tier = tiers?.find((t) => t.tierId === input.tierId);
			if (!tier) error(400, 'That ticket tier is no longer available.');

			const handle = await getAtmHandle(env);
			if (!handle) error(400, 'Ticketing is not configured');

			// The event page lives at /p/<actor>/e/<rkey>; the DID authority from
			// the AT-URI routes there too, so checkout returns straight to it.
			const [, did, rkey] = input.eventUri.match(/^at:\/\/([^/]+)\/[^/]+\/(.+)$/)!;
			const eventPageUrl = `${url.origin}/p/${did}/e/${rkey}`;

			try {
				if (!tier.unitAmount) {
					// Free tier: ATM's zero-price claim path (one ticket per claim).
					const buyerAssertionJwt = await mintBuyerAssertion(
						locals.client,
						ATM_XRPC_METHODS.tickets.claimFreeTicket,
						getAtmConfig(env)!.serviceAudience
					);
					const claim = await handle.atm.claimFreeTicket({
						environment: handle.environment,
						eventUri: input.eventUri,
						tierId: input.tierId,
						buyerDid: locals.did,
						buyerAssertionJwt,
						idempotencyKey: crypto.randomUUID()
					});
					await invalidateAvailabilityCache(env, input.eventUri);
					return { kind: 'claimed', count: claim.tickets?.length ?? 1 };
				}

				const buyerAssertionJwt = await mintBuyerAssertion(
					locals.client,
					ATM_XRPC_METHODS.payment.assertPayer,
					getAtmConfig(env)!.serviceAudience
				);
				const hold = await handle.atm.createTicketHold({
					environment: handle.environment,
					eventUri: input.eventUri,
					buyerDid: locals.did,
					buyerAssertionJwt,
					items: [{ tierId: input.tierId, quantity: input.quantity }],
					returnUrl: `${eventPageUrl}?tickets=success`,
					cancelUrl: eventPageUrl,
					idempotencyKey: crypto.randomUUID()
				});
				if (!hold.url) error(502, 'ATM did not return a checkout URL');
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
