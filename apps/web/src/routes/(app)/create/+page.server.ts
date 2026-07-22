import { redirect } from '@sveltejs/kit';
import { now as tidNow } from '@atcute/tid';
import { atmOrganizerTicketCreationEnabled, getAtmConfig } from '$lib/atm/config';

export async function load({ locals, platform }) {
	if (!locals.did) {
		redirect(303, '/login');
	}
	const env = platform?.env;
	const atmTicketsEnabled = Boolean(env && atmOrganizerTicketCreationEnabled(env, locals.did));
	const atmConfig = atmTicketsEnabled ? getAtmConfig(env!) : null;

	return {
		actorDid: locals.did,
		rkey: tidNow(),
		atmTicketsEnabled,
		atmTicketIconUrl: atmConfig
			? new URL('/atmosphere-tickets.svg', atmConfig.brokerUrl).toString()
			: null
	};
}
