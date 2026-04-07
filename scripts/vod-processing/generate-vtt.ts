/**
 * Step 5: Convert whisper-cpp JSON transcripts to WebVTT subtitle files.
 * Output: static/vods/<rkey>.vtt
 *
 * Also generates a JSON manifest at static/vods/manifest.json mapping rkey → available data.
 *
 * Options:
 *   --only=<rkey>   Process a single event
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSCRIPTS_DIR, EVENTS_FILE, type VodEvent } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_VODS_DIR = resolve(__dirname, '../../static/vods');

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

interface WhisperToken {
	text: string;
	offsets: { from: number; to: number };
	id: number;
	p: number;
}

interface WhisperSegment {
	timestamps: { from: string; to: string };
	offsets: { from: number; to: number };
	text: string;
	tokens: WhisperToken[];
}

interface WhisperJSON {
	transcription: WhisperSegment[];
}

function msToVttTime(ms: number): string {
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const frac = ms % 1000;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(3, '0')}`;
}

function isSpecialToken(token: WhisperToken): boolean {
	return token.text.startsWith('[') && token.text.endsWith(']');
}

/** Collect all real words across all segments into a flat list */
function flattenWords(data: WhisperJSON): WhisperToken[] {
	return data.transcription.flatMap((seg) =>
		seg.tokens.filter((t) => !isSpecialToken(t) && t.text.trim())
	);
}

const MAX_CUE_WORDS = 12;
const MAX_CUE_MS = 8000;

/** Split words into subtitle-sized chunks */
function chunkWords(words: WhisperToken[]): WhisperToken[][] {
	const chunks: WhisperToken[][] = [];
	let current: WhisperToken[] = [];

	for (const word of words) {
		current.push(word);

		const duration = word.offsets.to - (current[0]?.offsets.from ?? 0);
		const isSentenceEnd = /[.!?]$/.test(word.text.trim());
		const isLong = current.length >= MAX_CUE_WORDS || duration >= MAX_CUE_MS;

		if (isSentenceEnd || isLong) {
			chunks.push(current);
			current = [];
		}
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

/** Plain text VTT with short cues — works everywhere */
function generateVtt(data: WhisperJSON): string {
	const words = flattenWords(data);
	const chunks = chunkWords(words);
	const lines: string[] = ['WEBVTT', ''];

	for (const chunk of chunks) {
		const from = msToVttTime(chunk[0].offsets.from);
		const to = msToVttTime(chunk[chunk.length - 1].offsets.to);
		const text = chunk.map((w) => w.text).join('').trim();
		if (!text) continue;

		lines.push(`${from} --> ${to}`);
		lines.push(text);
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Merge whisper tokens so punctuation attaches to the preceding word.
 * e.g. [" Okay", "."] → [" Okay."]
 * This avoids invalid karaoke cues where a timestamp precedes bare punctuation.
 */
function mergeTokens(
	tokens: WhisperToken[]
): Array<{ text: string; from: number; to: number }> {
	const merged: Array<{ text: string; from: number; to: number }> = [];
	for (const t of tokens) {
		const isPunct = /^[.,!?;:'")\]}\-–—…]+$/.test(t.text.trim());
		if (isPunct && merged.length > 0) {
			// Attach punctuation to previous word
			merged[merged.length - 1].text += t.text;
			merged[merged.length - 1].to = t.offsets.to;
		} else {
			merged.push({ text: t.text, from: t.offsets.from, to: t.offsets.to });
		}
	}
	return merged;
}

/**
 * Karaoke VTT with word-level timestamps.
 * Spec: <HH:MM:SS.mmm> inline before each word marks when it becomes active.
 * Timestamps must be strictly increasing and within the cue's time range.
 */
function generateKaraokeVtt(data: WhisperJSON): string {
	const allWords = flattenWords(data);
	const merged = mergeTokens(allWords);

	// Re-chunk using merged tokens (reuse same logic but on merged shape)
	const chunks: Array<{ text: string; from: number; to: number }>[][] = [];
	let current: Array<{ text: string; from: number; to: number }> = [];
	for (const word of merged) {
		current.push(word);
		const duration = word.to - (current[0]?.from ?? 0);
		const isSentenceEnd = /[.!?]$/.test(word.text.trim());
		const isLong = current.length >= MAX_CUE_WORDS || duration >= MAX_CUE_MS;
		if (isSentenceEnd || isLong) {
			chunks.push(current);
			current = [];
		}
	}
	if (current.length > 0) chunks.push(current);

	const lines: string[] = ['WEBVTT', ''];

	for (const chunk of chunks) {
		const cueStart = chunk[0].from;
		const cueEnd = chunk[chunk.length - 1].to;

		// First word text appears at cue start (no inline timestamp needed).
		// Subsequent words get an inline timestamp, but only if it's strictly
		// greater than cueStart and any previous timestamp.
		let cueText = chunk[0].text;
		let lastTs = cueStart;

		for (let i = 1; i < chunk.length; i++) {
			const ts = chunk[i].from;
			if (ts > lastTs && ts < cueEnd) {
				cueText += `<${msToVttTime(ts)}>${chunk[i].text}`;
				lastTs = ts;
			} else {
				// Timestamp not strictly increasing or out of range — skip it
				cueText += chunk[i].text;
			}
		}

		cueText = cueText.trim();
		if (!cueText) continue;

		lines.push(`${msToVttTime(cueStart)} --> ${msToVttTime(cueEnd)}`);
		lines.push(cueText);
		lines.push('');
	}

	return lines.join('\n');
}

/** Also generate a plain transcript JSON for the interactive transcript UI */
function generateTranscriptJson(
	data: WhisperJSON
): Array<{ start: number; end: number; text: string; words: Array<{ text: string; start: number; end: number }> }> {
	return data.transcription
		.map((seg) => {
			const words = seg.tokens
				.filter((t) => !isSpecialToken(t) && t.text.trim())
				.map((t) => ({
					text: t.text,
					start: t.offsets.from / 1000,
					end: t.offsets.to / 1000
				}));

			if (words.length === 0) return null;

			return {
				start: seg.offsets.from / 1000,
				end: seg.offsets.to / 1000,
				text: seg.text.trim(),
				words
			};
		})
		.filter((s): s is NonNullable<typeof s> => s !== null);
}

function processEvent(event: VodEvent): boolean {
	const transcriptFile = `${TRANSCRIPTS_DIR}/${event.rkey}.json`;
	if (!existsSync(transcriptFile)) {
		console.log(`  – no transcript: ${event.rkey}`);
		return false;
	}

	const data: WhisperJSON = JSON.parse(readFileSync(transcriptFile, 'utf-8'));

	// Generate plain VTT (works everywhere)
	const vtt = generateVtt(data);
	writeFileSync(`${STATIC_VODS_DIR}/${event.rkey}.vtt`, vtt);

	// Generate karaoke VTT (word-level highlighting)
	const karaokeVtt = generateKaraokeVtt(data);
	writeFileSync(`${STATIC_VODS_DIR}/${event.rkey}-karaoke.vtt`, karaokeVtt);

	// Generate transcript JSON (for interactive transcript below video)
	const transcript = generateTranscriptJson(data);
	writeFileSync(`${STATIC_VODS_DIR}/${event.rkey}.json`, JSON.stringify(transcript));

	console.log(`  ✓ ${event.rkey} (${data.transcription.length} segments)`);
	return true;
}

function main() {
	const events: VodEvent[] = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
	mkdirSync(STATIC_VODS_DIR, { recursive: true });

	const toProcess = only ? events.filter((e) => e.rkey === only) : events;
	console.log(`Generating VTT + transcript JSON for ${toProcess.length} events...\n`);

	let success = 0;
	let skipped = 0;

	for (const event of toProcess) {
		if (processEvent(event)) success++;
		else skipped++;
	}

	// Generate manifest: list of rkeys that have VTT files
	const allVtts = readdirSync(STATIC_VODS_DIR)
		.filter((f) => f.endsWith('.vtt'))
		.map((f) => f.replace('.vtt', ''));
	writeFileSync(`${STATIC_VODS_DIR}/manifest.json`, JSON.stringify(allVtts));

	console.log(`\nDone: ${success} generated, ${skipped} skipped`);
	console.log(`Manifest: ${allVtts.length} VTTs in static/vods/`);
}

main();
