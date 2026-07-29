import { getServerClient } from '$lib/contrail';
import { happeningNowMeiliQuery, happeningNowQuery } from '$lib/contrail/queries';
import { rawForQuery } from '$lib/contrail/cursor';
import { searchBackendFromEnv } from '$lib/search/server/query';
import { getTopicBySlug } from '$lib/topics';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);

	// SCOPE, so a "See all N" offered beside a scoped band lands on the same N.
	// Unscoped (from home / /events) this is the whole live list, as before.
	const slug = url.searchParams.get('topic') ?? undefined;
	const topic = slug ? getTopicBySlug(slug) : undefined;
	const term = url.searchParams.get('q')?.trim() || undefined;

	// A term-scoped list does NOT resume an inbound ?cursor=: the term rides ?q=
	// rather than the envelope, so a cursor cannot be proven to belong to it — the
	// same rule the search route follows. A topic slug IS in the envelope, so it
	// can be matched.
	const cursor = term
		? undefined
		: rawForQuery(url.searchParams.get('cursor'), 'happening-now', topic ? { slug } : undefined);

	// A TERM-scoped page runs on the same backend as the band that linked here, or
	// the destination cannot contain what the band was already showing: the band on
	// /search sits beside a Meili-ranked list and promotes live events out of it,
	// and D1 does not agree with Meili about what matches a term. A topic needs no
	// such choice — its search is re-derived from the slug on both sides, so both
	// stay on D1. Page 1 may fall back to D1; a continuation may not.
	const page =
		term && searchBackendFromEnv(platform?.env)
			? ((await happeningNowMeiliQuery(platform?.env, client, { term }, cursor).catch((err) => {
					console.error('happening-now search backend failed, falling back to D1:', err);
					return null;
				})) ?? (await happeningNowQuery(client, cursor, { search: term })))
			: await happeningNowQuery(client, cursor, {
					slug: topic ? slug : undefined,
					search: term
				});

	// The SCOPE goes back to the client, not a pre-built link, so the page can put
	// it through resolve() and stay base-path safe. Two separate needs:
	//
	//  - "Upcoming events →" has to keep the scope the reader arrived with, or the
	//    one link off a scoped page drops them into an unrelated global list. Each
	//    scope has an upcoming list of its own; only an unscoped page means /events.
	//  - Load-more needs the TERM itself, which is why it is returned apart from
	//    scopeLabel (a topic's display NAME). The term rides the remote input rather
	//    than the cursor envelope, so without it the resumer has nothing to re-scope
	//    by and the list ends at page 1.
	return {
		...page,
		scopeLabel: topic?.name ?? term,
		term,
		slug: topic ? slug : undefined
	};
};
