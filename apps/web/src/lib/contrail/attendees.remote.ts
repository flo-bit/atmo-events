import { env } from 'cloudflare:workers';
import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { parseEventUri } from '@atmo-dev/kit/events-data';
import { listEventAttendeesFromContrail } from '#lib/contrail.js';
import { getServerClient } from './index';

// The event page renders from the RSVPs hydrated onto the event record. Kit's
// EventView calls this for the full list, with its slow 200-row profile
// hydration, only when someone opens a list that is longer than that sample.
export const loadEventAttendees = command(
	v.object({ eventUri: v.pipe(v.string(), v.maxLength(2048)) }),
	async ({ eventUri }) => {
		if (!parseEventUri(eventUri)) error(400, 'Invalid event URI');
		return listEventAttendeesFromContrail(getServerClient(env.DB), eventUri);
	}
);
