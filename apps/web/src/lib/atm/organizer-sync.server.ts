import { getAtmHandle } from './client';
import { AtmApiError, type AtmTicketAvailability, type AtmUpdateTicketEventInput } from './sdk';

type Env = App.Platform['env'];

export type OrganizerTicketSyncState = 'ticketed' | 'unticketed' | 'unknown';

export type TicketEventReferenceSource = {
	name?: string;
	startsAt?: string;
};

/**
 * Resolve whether an organizer-owned calendar event has an ATM sales shell.
 *
 * The edit page performs this read once. A confirmed negative disables the
 * post-save hook, so ordinary event edits never call ATM again. A transient
 * failure is deliberately `unknown`: the editor keeps the hook enabled so an
 * already-ticketed event cannot silently drift while ATM is unavailable.
 */
export async function probeOrganizerTicketSync(
	env: Env,
	eventUri: string
): Promise<OrganizerTicketSyncState> {
	let handle: Awaited<ReturnType<typeof getAtmHandle>>;
	try {
		handle = await getAtmHandle(env);
	} catch (cause) {
		console.warn('[atm] could not open app session to check event ticket sync:', cause);
		return 'unknown';
	}
	if (!handle) return 'unknown';

	try {
		const availability = await handle.atm.getTicketAvailability({
			environment: handle.environment,
			eventUri
		});
		return ticketEventIdFromAvailability(availability) ? 'ticketed' : 'unknown';
	} catch (cause) {
		if (cause instanceof AtmApiError && cause.code === 'EventNotFound') return 'unticketed';
		console.warn('[atm] could not determine whether event details need ticket sync:', cause);
		return 'unknown';
	} finally {
		try {
			await handle.flush();
		} catch (cause) {
			// This probe is advisory. A token-persistence failure must not turn the
			// organizer's edit page into a 404 or disable the fail-safe save hook.
			console.warn('[atm] could not persist app session after ticket sync probe:', cause);
		}
	}
}

export function ticketEventIdFromAvailability(availability: AtmTicketAvailability): string | null {
	const candidate =
		(availability as { event?: { id?: unknown } }).event?.id ?? availability.eventId;
	return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

/**
 * Build the narrow ATM reference update used after a canonical event edit.
 * Status is intentionally absent: calendar metadata changes must never pause,
 * activate, archive, or otherwise alter the organizer's sales state.
 */
export function ticketEventReferenceUpdate(input: {
	eventId: string;
	eventCid: string;
	source: TicketEventReferenceSource;
}): AtmUpdateTicketEventInput {
	const title = input.source.name?.trim();
	if (!title || !input.source.startsAt) {
		throw new Error('The calendar event needs a name and start time before tickets can be synced.');
	}
	return {
		eventId: input.eventId,
		eventCid: input.eventCid,
		title,
		startsAt: input.source.startsAt
	};
}

/** Idempotent retry boundary: no calendar write and no ticket status update. */
export async function syncTicketEventReference(input: {
	eventId: string;
	eventCid: string;
	source: TicketEventReferenceSource;
	updateTicketEvent: (update: AtmUpdateTicketEventInput) => Promise<void>;
}): Promise<void> {
	await input.updateTicketEvent(
		ticketEventReferenceUpdate({
			eventId: input.eventId,
			eventCid: input.eventCid,
			source: input.source
		})
	);
}
