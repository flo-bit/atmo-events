import { error, json } from '@sveltejs/kit';
import { isLinkedActor, parseGrainLink, createGrainXrpcClient } from '@atmo-dev/kit/grain';
import { cachedRead } from '#lib/server/edge-cache.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	const gallery = url.searchParams.get('gallery');
	const actor = url.searchParams.get('actor');
	const cursor = url.searchParams.get('cursor') || undefined;
	const ref = gallery ? parseGrainLink(gallery) : null;
	if (
		(gallery && actor) ||
		(!ref && (!actor || !isLinkedActor(actor))) ||
		(gallery && !ref) ||
		(cursor && cursor.length > 2048)
	) {
		error(400, 'Invalid linked record request');
	}
	// Normalize the SDK's redirect mode at the Worker boundary. Its response.ok
	// check rejects 3xx responses without following them or forwarding credentials.
	const client = createGrainXrpcClient((input, init) =>
		fetch(input, { ...init, redirect: 'manual', credentials: 'omit' })
	);
	try {
		// Brief caching only: albums can be edited, removed or relabeled at any time.
		const result = ref
			? await cachedRead(`grain/v1/gallery/${encodeURIComponent(ref.atUri)}`, 60, () =>
					client.getGallery(ref.atUri)
				)
			: await cachedRead(
					`grain/v1/actor/${encodeURIComponent(actor!)}/${encodeURIComponent(cursor ?? '')}`,
					60,
					() => client.listAlbums(actor!, cursor)
				);
		return json(result, { headers: { 'cache-control': 'public, max-age=60' } });
	} catch {
		error(502, 'Grain is temporarily unavailable');
	}
};
