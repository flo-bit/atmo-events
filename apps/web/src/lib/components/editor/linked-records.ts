import type { GrainAlbumPage, GrainGallery } from '@atmo-dev/kit/grain';
import type { SembleCollectionList, SembleCollectionPage } from '@atmo-dev/kit/semble';
import type { FlatEventRecord, LinkedRecordsClient } from '@atmo-dev/kit/events-data';

/** RSVP's same-origin transport; shared components know nothing about this route. */
export function createLinkedRecordsClient(fetchImpl: typeof fetch = fetch): LinkedRecordsClient {
	async function request<T>(params: Record<string, string>, path = ''): Promise<T> {
		const response = await fetchImpl(`/api/linked-records${path}?${new URLSearchParams(params)}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok) throw new Error('Linked record unavailable');
		return response.json() as Promise<T>;
	}
	return {
		getGrainGallery: (gallery) => request<GrainGallery>({ gallery }),
		listGrainAlbums: (actor, cursor) =>
			request<GrainAlbumPage>({ actor, ...(cursor ? { cursor } : {}) }),
		getSembleCollection: (collection) => request<SembleCollectionPage>({ collection }),
		listSembleCollections: (actor, cursor) =>
			request<SembleCollectionList>({ collections: actor, ...(cursor ? { cursor } : {}) }),
		getEvent: (actor, rkey) => request<FlatEventRecord>({ actor, rkey }, '/event')
	};
}
