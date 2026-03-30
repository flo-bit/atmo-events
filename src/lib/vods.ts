const STREAM_PLACE_DID = 'did:plc:rbvrr34edl5ddpuwcubjiost';
const STREAM_PLACE_PDS = 'https://iameli.com';
const VOD_COLLECTION = 'place.stream.video';
const VOD_PLAYBACK_BASE = 'https://vod-beta.stream.place/xrpc/place.stream.playback.getVideoPlaylist';

export interface VodRecord {
	uri: string;
	title: string;
	creator: string;
	duration: number; // nanoseconds
	playlistUrl: string;
}

let cachedVods: VodRecord[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchVods(): Promise<VodRecord[]> {
	if (cachedVods && Date.now() - cacheTime < CACHE_TTL) {
		return cachedVods;
	}

	const allRecords: VodRecord[] = [];
	let cursor: string | undefined;

	do {
		const params = new URLSearchParams({
			repo: STREAM_PLACE_DID,
			collection: VOD_COLLECTION,
			limit: '100'
		});
		if (cursor) params.set('cursor', cursor);

		const res = await fetch(`${STREAM_PLACE_PDS}/xrpc/com.atproto.repo.listRecords?${params}`);
		if (!res.ok) break;

		const data = (await res.json()) as {
			cursor?: string;
			records: Array<{
				uri: string;
				value: {
					title: string;
					creator: string;
					duration: number;
				};
			}>;
		};

		for (const r of data.records ?? []) {
			allRecords.push({
				uri: r.uri,
				title: r.value.title,
				creator: r.value.creator,
				duration: r.value.duration,
				playlistUrl: `${VOD_PLAYBACK_BASE}?uri=${encodeURIComponent(r.uri)}`
			});
		}

		cursor = data.cursor;
	} while (cursor);

	cachedVods = allRecords;
	cacheTime = Date.now();
	return cachedVods;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function findVodForEvent(eventName: string): Promise<VodRecord | null> {
	const vods = await fetchVods();
	const eventNorm = normalize(eventName);

	// Exact normalized match
	const exact = vods.find((v) => normalize(v.title) === eventNorm);
	if (exact) return exact;

	// Substring match (event name in VOD title or vice versa), require reasonable length
	if (eventNorm.length >= 10) {
		const partial = vods.find(
			(v) => {
				const vodNorm = normalize(v.title);
				return vodNorm.length >= 10 && (eventNorm.includes(vodNorm) || vodNorm.includes(eventNorm));
			}
		);
		if (partial) return partial;
	}

	return null;
}
