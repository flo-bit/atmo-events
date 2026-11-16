import { error, json } from '@sveltejs/kit';
import { isLinkedActor, parseGrainLink, createGrainXrpcClient } from '@atmo-dev/kit/grain';
import { parseSembleLink, createSembleXrpcClient } from '@atmo-dev/kit/semble';
import { cachedRead } from '#lib/server/edge-cache.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	// Exactly one read: a Grain gallery, an actor's Grain albums, a Semble collection,
	// or an actor's Semble collections.
	const gallery = url.searchParams.get('gallery');
	const actor = url.searchParams.get('actor');
	const collection = url.searchParams.get('collection');
	const collections = url.searchParams.get('collections');
	const cursor = url.searchParams.get('cursor') || undefined;
	const grain = gallery ? parseGrainLink(gallery) : null;
	const semble = collection ? parseSembleLink(collection) : null;
	const listActor = actor ?? collections;
	if (
		[gallery, actor, collection, collections].filter((value) => value !== null).length !== 1 ||
		(gallery !== null && !grain) ||
		(collection !== null && !semble) ||
		(listActor !== null && !isLinkedActor(listActor)) ||
		(cursor && (cursor.length > 2048 || (collections !== null && !/^[1-9]\d{0,3}$/.test(cursor))))
	) {
		error(400, 'Invalid linked record request');
	}
	// Normalize the SDK's redirect mode at the Worker boundary. Its response.ok
	// check rejects 3xx responses without following them or forwarding credentials.
	const upstream: typeof fetch = (input, init) =>
		fetch(input, { ...init, redirect: 'manual', credentials: 'omit' });
	const key = (...parts: string[]) => parts.map(encodeURIComponent).join('/');
	try {
		// Brief caching only: records can be edited, removed or relabeled at any time.
		let result: unknown;
		if (grain) {
			result = await cachedRead(`grain/v1/gallery/${key(grain.atUri)}`, 60, () =>
				createGrainXrpcClient(upstream).getGallery(grain.atUri)
			);
		} else if (actor) {
			result = await cachedRead(`grain/v1/actor/${key(actor, cursor ?? '')}`, 60, () =>
				createGrainXrpcClient(upstream).listAlbums(actor, cursor)
			);
		} else if (semble) {
			result = await cachedRead(`semble/v1/collection/${key(semble.atUri)}`, 60, () =>
				createSembleXrpcClient(upstream).getCollection(semble.atUri)
			);
		} else {
			result = await cachedRead(`semble/v1/actor/${key(collections!, cursor ?? '')}`, 60, () =>
				createSembleXrpcClient(upstream).listCollections(collections!, cursor)
			);
		}
		return json(result, { headers: { 'cache-control': 'public, max-age=60' } });
	} catch {
		error(502, `${grain || actor ? 'Grain' : 'Semble'} is temporarily unavailable`);
	}
};
