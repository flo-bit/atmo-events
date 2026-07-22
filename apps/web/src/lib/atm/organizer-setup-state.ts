export const CALENDAR_EVENT_COLLECTION = 'community.lexicon.calendar.event';
export const CALENDAR_EVENT_PLANNED = `${CALENDAR_EVENT_COLLECTION}#planned`;
export const CALENDAR_EVENT_SCHEDULED = `${CALENDAR_EVENT_COLLECTION}#scheduled`;

export type OrganizerCalendarRecord = Record<string, unknown> & {
	name?: string;
	startsAt?: string;
	status?: string;
	preferences?: Record<string, unknown>;
};

export type OrganizerTicketSetupState = 'hidden-draft' | 'published' | 'blocked';

/**
 * Ticket setup owns exactly one publication transition. Any other calendar
 * state belongs to the organizer/event app and must never be overwritten by a
 * stale ATM return URL.
 */
export function organizerTicketSetupState(
	record: OrganizerCalendarRecord
): OrganizerTicketSetupState {
	const showInDiscovery = record.preferences?.showInDiscovery;
	if (record.status === CALENDAR_EVENT_PLANNED && showInDiscovery === false) {
		return 'hidden-draft';
	}
	if (record.status === CALENDAR_EVENT_SCHEDULED && showInDiscovery === true) {
		return 'published';
	}
	return 'blocked';
}

export type TicketSetupRecordWrite = {
	uri: string;
	cid: string;
};

export type TicketSetupEventUpdate = {
	eventId: string;
	eventCid: string;
	status: 'active' | 'paused';
};

export class TicketSetupActivationError extends Error {
	readonly draftRestored: boolean;
	readonly atmResynced: boolean;
	readonly activationCause: unknown;
	readonly rollbackCause?: unknown;
	readonly resyncCause?: unknown;

	constructor(input: {
		activationCause: unknown;
		draftRestored: boolean;
		atmResynced: boolean;
		rollbackCause?: unknown;
		resyncCause?: unknown;
	}) {
		super('ATM could not activate the ticketed event.');
		this.name = 'TicketSetupActivationError';
		this.activationCause = input.activationCause;
		this.draftRestored = input.draftRestored;
		this.atmResynced = input.atmResynced;
		this.rollbackCause = input.rollbackCause;
		this.resyncCause = input.resyncCause;
	}
}

/**
 * Publish the calendar record and activate its ATM sales shell as one
 * compensating state transition. Cross-system atomicity is impossible, so an
 * activation failure restores the exact hidden draft with a CID compare/swap,
 * then points ATM at that restored CID and pauses it. A retry can safely start
 * from the restored hidden draft.
 */
export async function publishAndActivateTicketSetup(input: {
	eventId: string;
	sourceRecord: OrganizerCalendarRecord;
	sourceCid: string;
	writeRecord: (
		record: OrganizerCalendarRecord,
		swapRecord: string
	) => Promise<TicketSetupRecordWrite>;
	updateTicketEvent: (update: TicketSetupEventUpdate) => Promise<void>;
}): Promise<TicketSetupRecordWrite> {
	const publishedRecord: OrganizerCalendarRecord = {
		...input.sourceRecord,
		status: CALENDAR_EVENT_SCHEDULED,
		preferences: {
			...(input.sourceRecord.preferences ?? {}),
			showInDiscovery: true
		}
	};
	const published = await input.writeRecord(publishedRecord, input.sourceCid);

	try {
		await input.updateTicketEvent({
			eventId: input.eventId,
			eventCid: published.cid,
			status: 'active'
		});
		return published;
	} catch (activationCause) {
		let restored: TicketSetupRecordWrite;
		try {
			restored = await input.writeRecord(input.sourceRecord, published.cid);
		} catch (rollbackCause) {
			throw new TicketSetupActivationError({
				activationCause,
				draftRestored: false,
				atmResynced: false,
				rollbackCause
			});
		}

		try {
			await input.updateTicketEvent({
				eventId: input.eventId,
				eventCid: restored.cid,
				status: 'paused'
			});
		} catch (resyncCause) {
			throw new TicketSetupActivationError({
				activationCause,
				draftRestored: true,
				atmResynced: false,
				resyncCause
			});
		}

		throw new TicketSetupActivationError({
			activationCause,
			draftRestored: true,
			atmResynced: true
		});
	}
}
