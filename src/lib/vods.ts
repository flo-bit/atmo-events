import vodMap from './vod-map.json';

const STREAM_PLACE_DID = 'did:plc:rbvrr34edl5ddpuwcubjiost';
const VOD_PLAYBACK_BASE = 'https://vod-beta.stream.place/xrpc/place.stream.playback.getVideoPlaylist';

export interface VodRecord {
	vodRkey: string;
	vodTitle: string;
	playlistUrl: string;
}

function makePlaylistUrl(vodRkey: string): string {
	const uri = `at://${STREAM_PLACE_DID}/place.stream.video/${vodRkey}`;
	return `${VOD_PLAYBACK_BASE}?uri=${encodeURIComponent(uri)}`;
}

const vodByEventRkey = new Map<string, VodRecord>();
for (const entry of vodMap) {
	vodByEventRkey.set(entry.eventRkey, {
		vodRkey: entry.vodRkey,
		vodTitle: entry.vodTitle,
		playlistUrl: makePlaylistUrl(entry.vodRkey)
	});
}

export function getVodForEvent(eventRkey: string): VodRecord | null {
	return vodByEventRkey.get(eventRkey) ?? null;
}

export function getAllEventVods(): Map<string, VodRecord> {
	return vodByEventRkey;
}
