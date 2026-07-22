import { error, isHttpError } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import type { Client } from '@atcute/client';
import type { Did, Nsid } from '@atcute/lexicons';
import { atmConfigured, atmTicketOrganizerAllowed } from './config';
import { getAtmHandle } from './client';
import { AtmApiError, type AtmTicketAvailability } from './sdk';
import {
	CALENDAR_EVENT_COLLECTION,
	organizerTicketSetupState,
	publishAndActivateTicketSetup,
	TicketSetupActivationError,
	type OrganizerCalendarRecord
} from './organizer-setup-state';
import { syncTicketEventReference, ticketEventIdFromAvailability } from './organizer-sync.server';

const eventUriSchema = v.pipe(
	v.string(),
	v.regex(
		/^at:\/\/(did:[a-z0-9]+:[^/]+)\/community\.lexicon\.calendar\.event\/([a-zA-Z0-9._:~-]{1,512})$/,
		'Use an organizer-owned calendar event URI.'
	)
);

/**
 * Start or resume the app-neutral Atmosphere Tickets setup handoff.
 *
 * The browser contributes only an AT URI. This command resolves the record and
 * organizer from the authenticated PDS session, mints both route-scoped user
 * assertions on the server, and uses the app account for ATM XRPC calls.
 */
export const startOrganizerTicketSetup = command(
	v.object({ eventUri: eventUriSchema }),
	async (
		input
	): Promise<{
		url: string;
		eventId?: string;
		manageUrl?: string;
		alreadyPublished?: boolean;
	}> => {
		const request = getRequestEvent();
		const { locals, platform, url } = request;
		const env = platform?.env;
		if (!locals.client || !locals.did) error(401, 'Sign in to set up tickets.');
		if (!env || !atmConfigured(env)) error(400, 'Atmosphere Tickets is not configured.');
		if (!atmTicketOrganizerAllowed(env, locals.did)) {
			error(403, 'Atmosphere Tickets organizer access is not enabled for this account.');
		}

		const parsed = parseOwnedEventUri(input.eventUri, locals.did);
		const source = await readCalendarRecord(locals.client, locals.did, parsed.rkey);
		const sourceCid = stringValue(source.cid);
		if (!sourceCid) error(502, 'The event record did not return a valid CID.');
		const setupState = organizerTicketSetupState(source.record);
		const eventPage = new URL(`/p/${encodeURIComponent(locals.did)}/e/${parsed.rkey}`, url.origin);
		if (setupState === 'published') {
			eventPage.searchParams.set('tickets', 'configured');
			return {
				url: eventPage.toString(),
				manageUrl: eventPage.toString(),
				alreadyPublished: true
			};
		}
		if (setupState !== 'hidden-draft') {
			error(409, 'This event changed after ticket setup started. Reload it before resuming setup.');
		}
		if (!source.record.name || !source.record.startsAt) {
			error(400, 'Save an event name and start time before setting up tickets.');
		}

		const handle = await getAtmHandle(env);
		if (!handle) error(400, 'Atmosphere Tickets is not configured.');
		const editPage = new URL(`${eventPage.pathname}/edit`, url.origin);
		editPage.searchParams.set('atmTicketSetup', 'resume');
		const finishUrl = new URL(`${eventPage.pathname}/edit`, url.origin);
		finishUrl.searchParams.set('atmTicketSetup', 'complete');

		try {
			const setup = await handle.atm.startTicketSetup({
				environment: handle.environment,
				organizerDid: locals.did,
				event: {
					uri: input.eventUri,
					cid: sourceCid,
					title: source.record.name,
					startsAt: source.record.startsAt
				},
				approvalReturnUrl: editPage.toString(),
				setupReturnUrl: finishUrl.toString(),
				requestReason: `Sell tickets for ${source.record.name}`,
				metadata: {
					eventUrl: eventPage.toString(),
					eventSource: 'app',
					integrationApp: 'atmo-rsvp'
				},
				getOrganizerAssertionToken: ({ lxm, aud }) => mintUserAssertion(locals.client!, lxm, aud)
			});
			const eventId = stringValue(setup.event.id);
			if (!eventId) error(502, 'ATM did not return a ticketed event id.');
			return { url: setup.nextUrl, eventId, manageUrl: setup.manageUrl };
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			if (cause instanceof AtmApiError) {
				error(cause.status >= 500 ? 502 : 400, friendlySetupError(cause));
			}
			console.error('[atm] organizer ticket setup failed:', cause);
			error(502, 'Ticket setup is temporarily unavailable — your hidden event draft is safe.');
		} finally {
			await handle.flush();
		}
	}
);

/**
 * Readiness-gated final publish. ATM remains the source of ticket inventory;
 * only after it reports a configured tier do we publish the same PDS record as
 * scheduled/discoverable and activate the ATM event against the new CID.
 */
export const completeOrganizerTicketSetup = command(
	v.object({ eventUri: eventUriSchema }),
	async (input): Promise<{ uri: string; cid: string }> => {
		const { locals, platform } = getRequestEvent();
		const env = platform?.env;
		if (!locals.client || !locals.did) error(401, 'Sign in to publish this event.');
		if (!env || !atmConfigured(env)) error(400, 'Atmosphere Tickets is not configured.');
		if (!atmTicketOrganizerAllowed(env, locals.did)) {
			error(403, 'Atmosphere Tickets organizer access is not enabled for this account.');
		}
		const parsed = parseOwnedEventUri(input.eventUri, locals.did);
		const client = locals.client;
		const source = await readCalendarRecord(client, locals.did, parsed.rkey);
		const sourceCid = stringValue(source.cid);
		if (!sourceCid) error(502, 'The event record did not return a valid CID.');
		const setupState = organizerTicketSetupState(source.record);
		if (setupState === 'published') {
			return { uri: input.eventUri, cid: sourceCid };
		}
		if (setupState !== 'hidden-draft') {
			error(
				409,
				'This event changed after ticket setup started. Reload it before publishing tickets.'
			);
		}
		const handle = await getAtmHandle(env);
		if (!handle) error(400, 'Atmosphere Tickets is not configured.');

		try {
			const availability = await handle.atm.getTicketAvailability({
				environment: handle.environment,
				eventUri: input.eventUri
			});
			const configuredTiers = (availability.tiers ?? []).filter((tier) => {
				const status = String(tier.status ?? 'hidden');
				return typeof tier.tierId === 'string' && tier.tierId.length > 0 && status !== 'hidden';
			});
			if (configuredTiers.length === 0) {
				error(409, 'Add and publish at least one ticket type in ATM before publishing the event.');
			}
			const eventId = stringValue(
				(availability as { event?: { id?: unknown }; eventId?: unknown }).event?.id ??
					availability.eventId
			);
			if (!eventId) error(502, 'ATM could not resolve this ticketed event.');

			return await publishAndActivateTicketSetup({
				eventId,
				sourceRecord: source.record,
				sourceCid,
				writeRecord: async (record, swapRecord) => {
					const write = await client.post('com.atproto.repo.putRecord', {
						input: {
							repo: locals.did!,
							collection: CALENDAR_EVENT_COLLECTION,
							rkey: parsed.rkey,
							record,
							swapRecord
						}
					});
					if (!write.ok) throw new Error('The event record write was rejected by the PDS.');
					return { uri: write.data.uri, cid: write.data.cid };
				},
				updateTicketEvent: async (update) => {
					await handle.atm.updateTicketEvent({
						environment: handle.environment,
						...update
					});
				}
			});
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			if (cause instanceof TicketSetupActivationError) {
				console.error('[atm] ticket activation required compensation:', {
					draftRestored: cause.draftRestored,
					atmResynced: cause.atmResynced,
					activationCause: cause.activationCause,
					rollbackCause: cause.rollbackCause,
					resyncCause: cause.resyncCause
				});
				if (cause.draftRestored && cause.atmResynced) {
					error(
						502,
						'ATM could not activate ticket sales. Your hidden draft was restored; try again.'
					);
				}
				if (cause.draftRestored) {
					error(
						502,
						'ATM could not activate ticket sales. Your hidden draft was restored; resume setup to repair the ATM link, then try again.'
					);
				}
				error(
					502,
					'ATM could not activate ticket sales, and the event changed before it could be restored. Reload the event before retrying.'
				);
			}
			if (cause instanceof AtmApiError) {
				error(cause.status >= 500 ? 502 : 400, friendlySetupError(cause));
			}
			console.error('[atm] complete organizer ticket setup failed:', cause);
			error(502, 'Could not publish the ticketed event. Please try again.');
		} finally {
			await handle.flush();
		}
	}
);

/**
 * Keep ATM's immutable event strongRef and display snapshot aligned after an
 * organizer edits an active canonical event. The calendar write has already
 * succeeded in the browser; this command therefore only accepts its CID as an
 * expectation, re-reads the record from the authenticated organizer's PDS,
 * and updates the existing ATM shell without touching sales status.
 */
export const syncOrganizerTicketEvent = command(
	v.object({
		eventUri: eventUriSchema,
		eventCid: v.pipe(v.string(), v.minLength(1)),
		expectTicketEvent: v.boolean()
	}),
	async (input): Promise<{ ticketed: boolean; cid: string }> => {
		const { locals, platform } = getRequestEvent();
		const env = platform?.env;
		if (!locals.client || !locals.did) error(401, 'Sign in to sync ticket details.');
		if (!env || !atmConfigured(env)) error(400, 'Atmosphere Tickets is not configured.');

		const parsed = parseOwnedEventUri(input.eventUri, locals.did);
		const source = await readCalendarRecord(locals.client, locals.did, parsed.rkey);
		const sourceCid = stringValue(source.cid);
		if (!sourceCid) error(502, 'The event record did not return a valid CID.');
		if (sourceCid !== input.eventCid) {
			error(409, 'This event changed in another session. Reload it before syncing tickets.');
		}

		const handle = await getAtmHandle(env);
		if (!handle) error(400, 'Atmosphere Tickets is not configured.');

		try {
			let availability: AtmTicketAvailability;
			try {
				availability = await handle.atm.getTicketAvailability({
					environment: handle.environment,
					eventUri: input.eventUri
				});
			} catch (cause) {
				if (cause instanceof AtmApiError && cause.code === 'EventNotFound') {
					if (input.expectTicketEvent) {
						error(
							409,
							'ATM could not find the ticketed event that was linked when this page opened. Retry or reopen the editor.'
						);
					}
					return { ticketed: false, cid: sourceCid };
				}
				throw cause;
			}

			const eventId = ticketEventIdFromAvailability(availability);
			if (!eventId) error(502, 'ATM returned ticket availability without an event id.');
			await syncTicketEventReference({
				eventId,
				eventCid: sourceCid,
				source: source.record,
				updateTicketEvent: async (update) => {
					await handle.atm.updateTicketEvent({
						environment: handle.environment,
						...update
					});
				}
			});
			return { ticketed: true, cid: sourceCid };
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			if (cause instanceof AtmApiError) {
				error(cause.status >= 500 ? 502 : 400, friendlySetupError(cause));
			}
			console.error('[atm] organizer ticket event sync failed:', cause);
			error(
				502,
				'Your event was saved, but Atmosphere Tickets could not be updated. Retry the ticket sync.'
			);
		} finally {
			await handle.flush();
		}
	}
);

function parseOwnedEventUri(eventUri: string, viewerDid: string): { rkey: string } {
	const match = eventUri.match(
		/^at:\/\/(did:[a-z0-9]+:[^/]+)\/community\.lexicon\.calendar\.event\/([a-zA-Z0-9._:~-]{1,512})$/
	);
	if (!match || match[1] !== viewerDid) error(403, 'You can only configure your own events.');
	return { rkey: match[2]! };
}

async function readCalendarRecord(client: Client, did: string, rkey: string) {
	const response = await client.get('com.atproto.repo.getRecord', {
		params: { repo: did as Did, collection: CALENDAR_EVENT_COLLECTION, rkey }
	});
	if (!response.ok) error(404, 'Event record not found.');
	return {
		record: response.data.value as OrganizerCalendarRecord,
		cid: response.data.cid
	};
}

async function mintUserAssertion(client: Client, lxm: string, aud: string): Promise<string> {
	const response = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: aud as Did, lxm: lxm as Nsid }
	});
	if (!response.ok) {
		error(401, 'Reconnect your Atmosphere account to authorize ticket setup.');
	}
	return response.data.token;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

function friendlySetupError(cause: AtmApiError): string {
	switch (cause.code) {
		case 'OrganizerConsentRequired':
		case 'UserDidMismatch':
			return 'Reconnect your Atmosphere account to authorize this event.';
		case 'TicketsModuleDisabled':
		case 'AppNotRegistered':
			return 'Atmosphere Tickets is not enabled for this app yet.';
		case 'RecipientAppApprovalBlocked':
			return 'Ticket sales for this app are blocked in ATM.';
		case 'PaymentSetupIncomplete':
			return 'Continue to ATM to finish organizer payment setup.';
		default:
			return cause.message || 'Ticket setup could not be started.';
	}
}
