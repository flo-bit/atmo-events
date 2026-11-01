import { error, json } from '@sveltejs/kit';
import { actorToDid } from '#lib/actor.js';
import { meetingIdentifier } from '#lib/meet/connection.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const actor = meetingIdentifier(url.searchParams.get('actor') ?? '');
	if (!actor) error(400, 'Enter a valid handle or DID.');
	try {
		return json({ did: await actorToDid(actor) });
	} catch {
		error(404, 'Could not resolve that handle. Check it or try their DID.');
	}
};
