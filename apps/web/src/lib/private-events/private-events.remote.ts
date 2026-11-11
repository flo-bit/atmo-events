import { error } from '@sveltejs/kit';
import { command, getRequestEvent, query } from '$app/server';
import * as v from 'valibot';
import { RSVP_STATUSES } from './ids';
import { asCaller } from './server/command';
import { privateEventsBetaOn } from './beta';
import { BetaNotSaved, canSaveBeta, readBetaRecord, saveBeta } from './server/beta';
import { privateEventsEnabled } from './server/enabled';
import {
	addGuest as addGuestToEvent,
	cancelPrivateEvent as cancelEvent,
	deletePrivateRsvp,
	putPrivateRsvp,
	removeGuest as removeGuestFromEvent,
	savePrivateEvent as saveEvent
} from './server/events';

const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:[a-zA-Z0-9._:%-]{1,2048}$/));
const rkeySchema = v.pipe(v.string(), v.regex(/^[a-zA-Z0-9._:~-]{1,512}$/));

export const savePrivateEvent = command(
	v.object({ rkey: rkeySchema, record: v.record(v.string(), v.unknown()) }),
	(input) => asCaller((caller) => saveEvent(caller, input))
);

export const cancelPrivateEvent = command(v.object({ rkey: rkeySchema }), ({ rkey }) =>
	asCaller((caller) => cancelEvent(caller, rkey))
);

export const rsvpToPrivateEvent = command(
	v.object({
		host: didSchema,
		rkey: rkeySchema,
		status: v.picklist(RSVP_STATUSES),
		cid: v.nullable(v.string())
	}),
	({ host, ...input }) => asCaller((caller) => putPrivateRsvp(caller, host, input))
);

export const cancelPrivateRsvp = command(
	v.object({ host: didSchema, rkey: rkeySchema }),
	({ host, rkey }) => asCaller((caller) => deletePrivateRsvp(caller, host, rkey))
);

export const addGuest = command(
	v.object({
		rkey: rkeySchema,
		handleOrDid: v.pipe(v.string(), v.minLength(3), v.maxLength(2048))
	}),
	(input) => asCaller((caller) => addGuestToEvent(caller, input))
);

export const removeGuest = command(v.object({ rkey: rkeySchema, did: didSchema }), (input) =>
	asCaller((caller) => removeGuestFromEvent(caller, input))
);

/** The signed-in person, for the beta switch, which lives in their public repo, not in a space. */
function betaCaller() {
	if (!privateEventsEnabled()) error(404, 'Not found');
	const { locals } = getRequestEvent();
	if (!locals.client || !locals.did) error(401, 'Sign in first');
	return { client: locals.client, did: locals.did };
}

export const getPrivateEventsBeta = query(async () => {
	const { client, did } = betaCaller();
	const [canSave, found] = await Promise.all([
		canSaveBeta(),
		readBetaRecord(client, did, AbortSignal.timeout(5_000))
	]);
	return { canSave, on: privateEventsBetaOn(found?.record) };
});

export const setPrivateEventsBeta = command(v.object({ on: v.boolean() }), async ({ on }) => {
	const { client, did } = betaCaller();
	if (!(await canSaveBeta())) error(403, 'Authorize atmo to save this setting first.');
	try {
		await saveBeta(client, did, on);
	} catch (e) {
		error(
			e instanceof BetaNotSaved ? 409 : 502,
			e instanceof BetaNotSaved ? e.message : 'Could not reach your data server. Try again.'
		);
	}
	// The page asks for the setting with the save (.updates), which needs the refresh to be done here.
	await getPrivateEventsBeta().refresh();
	return { on };
});
