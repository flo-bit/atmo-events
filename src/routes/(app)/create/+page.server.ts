import { redirect } from '@sveltejs/kit';
import { now as tidNow } from '@atcute/tid';

export async function load({ locals, url }) {
	if (!locals.did) {
		redirect(303, '/login');
	}

	// prefill from scheduling flow
	const prefill = url.searchParams.has('starts_at')
		? {
				name: url.searchParams.get('schedule_title') ?? '',
				startsAt: url.searchParams.get('starts_at') ?? '',
				endsAt: url.searchParams.get('ends_at') ?? '',
				timezone: url.searchParams.get('timezone') ?? '',
				scheduleId: url.searchParams.get('schedule_id') ?? ''
			}
		: null;

	const rkey = tidNow();

	return {
		actorDid: locals.did,
		rkey,
		prefill
	};
}
