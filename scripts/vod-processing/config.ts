import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = resolve(__dirname, 'data');
export const AUDIO_DIR = resolve(DATA_DIR, 'audio');
export const TRANSCRIPTS_DIR = resolve(DATA_DIR, 'transcripts');
export const OUTPUT_DIR = resolve(DATA_DIR, 'output');

export const EVENTS_FILE = resolve(DATA_DIR, 'events.json');

export const API_URL = 'https://atmo.rsvp/xrpc/community.lexicon.calendar.event.listRecords';
export const VOD_PLAYBACK_BASE =
	'https://vod-beta.stream.place/xrpc/place.stream.playback.getVideoPlaylist';

export interface VodEvent {
	rkey: string;
	name: string;
	description: string;
	speakers: string[];
	startsAt: string;
	endsAt: string;
	vodAtUri: string;
	playlistUrl: string;
	room: string;
	type: string;
}

export interface WhisperSegment {
	start: number;
	end: number;
	text: string;
	speaker?: string;
	words: WhisperWord[];
}

export interface WhisperWord {
	word: string;
	start: number;
	end: number;
	score: number;
	speaker?: string;
}

export interface TranscriptData {
	segments: WhisperSegment[];
	word_segments: WhisperWord[];
	language: string;
}

export interface Chapter {
	start: number;
	end: number;
	title: string;
}

export interface VodOutput {
	rkey: string;
	name: string;
	speakers: string[];
	description: string;
	transcript: TranscriptData;
	chapters: Chapter[];
	summary: string;
}
