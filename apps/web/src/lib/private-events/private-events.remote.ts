import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { RSVP_STATUSES } from './ids';
import { callerSession, type CallerSession } from './server/caller';
import { privateEventsEnabled } from './server/enabled';
import {
	addGuest as addGuestToEvent,
	cancelPrivateEvent as cancelEvent,
	deletePrivateRsvp,
	PrivateEventRefused,
	putPrivateRsvp,
	removeGuest as removeGuestFromEvent,
	savePrivateEvent as saveEvent
} from './server/events';

const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:[a-zA-Z0-9._:%-]{1,2048}$/));
const rkeySchema = v.pipe(v.string(), v.regex(/^[a-zA-Z0-9._:~-]{1,512}$/));

async function signedIn(): Promise<CallerSession> {
	if (!privateEventsEnabled()) error(404, 'Not found');
	const caller = await callerSession(getRequestEvent().locals.session);
	if (!caller) error(401, 'Sign in first');
	return caller;
}

/** A refusal in its own words, which the page shows; it never reads as saved. */
async function answer<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof PrivateEventRefused) error(409, e.message);
		throw e;
	}
}

export const savePrivateEvent = command(
	v.object({ rkey: rkeySchema, record: v.record(v.string(), v.unknown()) }),
	async (input) => {
		const caller = await signedIn();
		return answer(() => saveEvent(caller, input));
	}
);

export const cancelPrivateEvent = command(v.object({ rkey: rkeySchema }), async ({ rkey }) => {
	const caller = await signedIn();
	return answer(() => cancelEvent(caller, rkey));
});

export const rsvpToPrivateEvent = command(
	v.object({
		host: didSchema,
		rkey: rkeySchema,
		status: v.picklist(RSVP_STATUSES),
		cid: v.nullable(v.string())
	}),
	async ({ host, ...input }) => {
		const caller = await signedIn();
		return answer(() => putPrivateRsvp(caller, host, input));
	}
);

export const cancelPrivateRsvp = command(
	v.object({ host: didSchema, rkey: rkeySchema }),
	async ({ host, rkey }) => {
		const caller = await signedIn();
		return answer(() => deletePrivateRsvp(caller, host, rkey));
	}
);

export const addGuest = command(
	v.object({
		rkey: rkeySchema,
		handleOrDid: v.pipe(v.string(), v.minLength(3), v.maxLength(2048))
	}),
	async (input) => {
		const caller = await signedIn();
		return answer(() => addGuestToEvent(caller, input));
	}
);

export const removeGuest = command(
	v.object({ rkey: rkeySchema, did: didSchema }),
	async (input) => {
		const caller = await signedIn();
		return answer(() => removeGuestFromEvent(caller, input));
	}
);
