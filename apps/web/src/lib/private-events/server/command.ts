import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { callerSession, type CallerSession } from './caller';
import { privateEventsEnabled } from './enabled';
import { PrivateEventRefused } from './events';

/** Runs a command as the signed-in person. A refusal comes back in its own words, which the page
 *  shows, so it never reads as saved. */
export async function asCaller<T>(run: (caller: CallerSession) => Promise<T>): Promise<T> {
	if (!privateEventsEnabled()) error(404, 'Not found');
	const caller = await callerSession(getRequestEvent().locals.session);
	if (!caller) error(401, 'Sign in first');
	try {
		return await run(caller);
	} catch (e) {
		if (e instanceof PrivateEventRefused) error(409, e.message);
		throw e;
	}
}
