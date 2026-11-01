import { error, fail } from '@sveltejs/kit';
import { isDid } from '@atcute/lexicons/syntax';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { actorToDid } from '#lib/actor.js';
import { getBlueskyProfile } from '#lib/server/bluesky-profile.js';
import { incomingMeetingDate, listConnections, listIncomingConnections } from '#lib/server/meet.js';
import {
	CONNECTION_COLLECTION,
	connectionCapability,
	connectionRecord,
	incomingConnectionRkey,
	meetingIdentifier,
	type Connection
} from '#lib/meet/connection.js';
import type { Actions, PageServerLoad } from './$types';

async function canMeet() {
	try {
		return await getAuth().api.can(connectionCapability);
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	const requestedActor = url.searchParams.get('actor') ?? url.searchParams.get('did');
	let subject: string | null = null;
	if (requestedActor !== null) {
		const identifier = meetingIdentifier(requestedActor);
		if (!identifier) error(400, 'Invalid meeting link');
		try {
			subject = await actorToDid(identifier);
		} catch {
			error(404, 'Could not resolve that handle. Check it or try their DID.');
		}
	}
	const target =
		subject && subject !== locals.did
			? { did: subject, profile: (await getBlueskyProfile(subject, fetch)) ?? null }
			: null;
	let outgoing: Connection[] = [];
	let incoming: Connection[] = [];
	let outgoingFailed = false;
	let incomingFailed = false;
	if (locals.did && locals.client) {
		const results = await Promise.allSettled([
			listConnections(locals.client, locals.did),
			listIncomingConnections(locals.did, fetch)
		]);
		if (results[0].status === 'fulfilled') outgoing = results[0].value;
		else outgoingFailed = true;
		if (results[1].status === 'fulfilled') incoming = results[1].value;
		else incomingFailed = true;
	}
	return {
		pageTitle: 'Meet · atmo.rsvp',
		pageDescription:
			'Scan a QR code to remember someone you met, with a public AT Protocol connection.',
		target,
		selfScan: subject !== null && subject === locals.did,
		canMeet: !!locals.did && !!locals.client && (await canMeet()),
		connections: [...outgoing, ...incoming],
		outgoingFailed,
		incomingFailed
	};
};

export const actions: Actions = {
	default: async ({ locals, request, fetch }) => {
		if (!locals.did || !locals.client) return fail(401, { message: 'Log in to save a meeting.' });
		const form = await request.formData();
		const subject = form.get('subject');
		if (!isDid(subject) || subject === locals.did)
			return fail(400, { message: 'Choose someone other than yourself.' });
		const incomingUri = form.get('incomingUri');
		if (
			incomingUri &&
			(typeof incomingUri !== 'string' || !incomingConnectionRkey(incomingUri, subject))
		) {
			return fail(400, { message: 'Invalid original meeting record.' });
		}
		if (!(await canMeet())) return fail(403, { message: 'Enable meetings to save a connection.' });
		try {
			const existing = (await listConnections(locals.client, locals.did)).find(
				(r) => r.subject === subject
			);
			if (existing) return { saved: existing, alreadyMet: true };
			let createdAt: string | undefined;
			if (typeof incomingUri === 'string' && incomingUri) {
				try {
					createdAt = await incomingMeetingDate(incomingUri, subject, locals.did, fetch);
				} catch {
					return fail(502, {
						message: 'Could not verify the original meeting date. Nothing was saved. Try again.'
					});
				}
			}
			const record = connectionRecord(subject, createdAt);
			const response = await locals.client.post('com.atproto.repo.createRecord', {
				input: { repo: locals.did, collection: CONNECTION_COLLECTION, record }
			});
			if (!response.ok) return fail(502, { message: 'Could not save the meeting. Try again.' });
			return {
				saved: { uri: response.data.uri, owner: locals.did, subject, createdAt: record.createdAt },
				alreadyMet: false
			};
		} catch {
			return fail(502, { message: 'Could not reach your data server. Try again.' });
		}
	}
};
