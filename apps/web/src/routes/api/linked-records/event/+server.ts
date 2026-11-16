import { env } from 'cloudflare:workers';
import { error, json } from '@sveltejs/kit';
import { isLinkedActor } from '@atmo-dev/kit/grain';
import { flattenEventRecord, getEventRecordFromContrail } from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import type { RequestHandler } from './$types';

/** One public event, for the card shown when a description links to another event. */
export const GET: RequestHandler = async ({ url }) => {
	const actor = url.searchParams.get('actor') ?? '';
	const rkey = url.searchParams.get('rkey') ?? '';
	if (!isLinkedActor(actor) || !/^[A-Za-z0-9._~:-]{1,512}$/.test(rkey) || rkey.startsWith('.')) {
		error(400, 'Invalid event request');
	}
	// The same indexed read as the event page, so hidden and private events stay unavailable.
	// Contrail resolves a handle in the URI authority itself.
	const record = await getEventRecordFromContrail(getServerClient(env.DB), { did: actor, rkey });
	const event = record ? flattenEventRecord(record) : null;
	if (!event) error(404, 'Event not found');
	// Never cached: a hidden or deleted event must stop being served at once, as on the event page.
	return json(event, { headers: { 'cache-control': 'no-store' } });
};
