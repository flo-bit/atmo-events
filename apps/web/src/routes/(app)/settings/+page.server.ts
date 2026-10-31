import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	PREFERRED_CLIENT_COLLECTION,
	PREFERRED_CLIENT_RKEY,
	parsePreferredSocialClient,
	preferredSocialClientRecord
} from '@atmo-dev/kit/social';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { getPreferredClientRecord } from '#lib/atproto/preferred-client.server.js';

async function canSaveClient() {
	try {
		const api = getAuth().api;
		return (
			(await api.can({
				type: 'repo',
				collection: PREFERRED_CLIENT_COLLECTION,
				action: 'create'
			})) &&
			(await api.can({ type: 'repo', collection: PREFERRED_CLIENT_COLLECTION, action: 'update' }))
		);
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async ({ locals }) => ({
	pageTitle: 'Settings · atmo.rsvp',
	pageDescription: 'Choose your preferred social app.',
	canSaveClient: !!locals.did && !!locals.client && (await canSaveClient())
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.did || !locals.client)
			return fail(401, { message: 'Log in to save your selection.' });
		const form = await request.formData();
		const preference = parsePreferredSocialClient({
			client: form.get('client'),
			customUrl: form.get('customUrl')
		});
		if (!preference)
			return fail(400, {
				message: 'Choose a client and enter a valid HTTP(S) URL without a query or fragment.'
			});
		if (!(await canSaveClient()))
			return fail(403, {
				message: 'Authorize access in Settings to save your social app selection.'
			});

		try {
			const current = await getPreferredClientRecord(locals.client, locals.did);
			const record = {
				...(current?.record as Record<string, unknown> | undefined),
				...preferredSocialClientRecord(preference)
			};
			if (preference.client !== 'custom') delete record.customUrl;
			const response = await locals.client.post('com.atproto.repo.putRecord', {
				input: {
					repo: locals.did,
					collection: PREFERRED_CLIENT_COLLECTION,
					rkey: PREFERRED_CLIENT_RKEY,
					record,
					swapRecord: current?.cid ?? null
				}
			});
			if (!response.ok) {
				return response.data.error === 'InvalidSwap'
					? fail(409, { message: 'Your selection changed elsewhere. Reload and try again.' })
					: fail(502, { message: 'Could not save your selection. Try again.' });
			}
			return { saved: true };
		} catch {
			return fail(502, { message: 'Could not reach your data server. Try again.' });
		}
	}
};
