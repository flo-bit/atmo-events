import type { GrainAlbumPage, GrainGallery } from '@atmo-dev/kit/grain';
import type { LinkedRecordsClient } from '@atmo-dev/kit/events-data';

/** RSVP's same-origin transport; shared components know nothing about this route. */
export function createLinkedRecordsClient(fetchImpl: typeof fetch = fetch): LinkedRecordsClient {
	async function request<T>(params: Record<string, string>): Promise<T> {
		const response = await fetchImpl(`/api/linked-records?${new URLSearchParams(params)}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok) throw new Error('Linked record unavailable');
		return response.json() as Promise<T>;
	}
	return {
		getGrainGallery: (gallery) => request<GrainGallery>({ gallery }),
		listGrainAlbums: (actor, cursor) =>
			request<GrainAlbumPage>({ actor, ...(cursor ? { cursor } : {}) })
	};
}
