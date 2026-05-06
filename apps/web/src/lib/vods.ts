const VOD_PLAYBACK_BASE = 'https://vod-beta.stream.place/xrpc/place.stream.playback.getVideoPlaylist';

export interface VodRecord {
	atUri: string;
	playlistUrl: string;
}

export function vodFromAtUri(atUri: string): VodRecord {
	return {
		atUri,
		playlistUrl: `${VOD_PLAYBACK_BASE}?uri=${encodeURIComponent(atUri)}`
	};
}
