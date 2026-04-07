/**
 * Step 3: Run whisper-cpp on audio files.
 * Uses whisper-cli (brew install whisper-cpp) with --output-json-full
 * for word-level timestamps.
 *
 * Output: data/transcripts/<rkey>.json
 *
 * Options:
 *   --model=<path>     Path to ggml model file (default: large-v3-turbo-q8_0)
 *   --only=<rkey>      Process a single event
 *   --diarize          Enable stereo diarization (needs stereo audio)
 *   --tinydiarize      Enable tinydiarize (needs tdrz model)
 */

import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { AUDIO_DIR, TRANSCRIPTS_DIR, EVENTS_FILE, type VodEvent } from './config.js';

const args = process.argv.slice(2);
const model =
	args.find((a) => a.startsWith('--model='))?.split('=')[1] ??
	`${process.env.HOME}/Library/Caches/whisper-cpp/ggml-large-v3-turbo-q8_0.bin`;
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const diarize = args.includes('--diarize');
const tinydiarize = args.includes('--tinydiarize');

function findModel(): string {
	if (existsSync(model)) return model;

	// Try common locations
	const candidates = [
		`${process.env.HOME}/Library/Caches/whisper-cpp/ggml-large-v3-turbo-q8_0.bin`,
		`${process.env.HOME}/Library/Caches/whisper-cpp/ggml-large-v3.bin`,
		`${process.env.HOME}/Library/Caches/whisper-cpp/ggml-large-v3-turbo.bin`,
		`${process.env.HOME}/.cache/whisper-cpp/ggml-large-v3-turbo-q8_0.bin`,
		'/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin'
	];

	for (const c of candidates) {
		if (existsSync(c)) {
			console.log(`Found model: ${c}`);
			return c;
		}
	}

	console.error(
		'No whisper model found. Download one with:\n' +
			'  whisper-cli --model-path <path> --model ggml-large-v3-turbo-q8_0\n' +
			'Or pass --model=<path>'
	);
	process.exit(1);
}

function transcribe(event: VodEvent, modelPath: string): boolean {
	const audioPath = `${AUDIO_DIR}/${event.rkey}.wav`;
	const outFile = `${TRANSCRIPTS_DIR}/${event.rkey}.json`;

	if (existsSync(outFile)) {
		console.log(`  ✓ already transcribed: ${event.rkey}`);
		return true;
	}

	if (!existsSync(audioPath)) {
		console.log(`  ✗ no audio file: ${event.rkey}`);
		return false;
	}

	const flags = [
		`--model "${modelPath}"`,
		'--output-json-full', // includes word-level timestamps
		`--output-file "${TRANSCRIPTS_DIR}/${event.rkey}"`,
		'--language en',
		'--print-progress',
		diarize ? '--diarize' : '',
		tinydiarize ? '--tinydiarize' : ''
	]
		.filter(Boolean)
		.join(' ');

	try {
		console.log(`  ⏳ transcribing: ${event.rkey} (${event.name})...`);
		execSync(`whisper-cli ${flags} "${audioPath}" 2>&1`, {
			timeout: 1_800_000, // 30 min
			stdio: ['pipe', 'pipe', 'pipe']
		});

		// whisper-cli outputs as <name>.json
		if (existsSync(outFile)) {
			console.log(`  ✓ transcribed: ${event.rkey}`);
			return true;
		}

		// Sometimes it appends .wav.json
		const altOut = `${TRANSCRIPTS_DIR}/${event.rkey}.wav.json`;
		if (existsSync(altOut)) {
			renameSync(altOut, outFile);
			console.log(`  ✓ transcribed: ${event.rkey}`);
			return true;
		}

		console.error(`  ✗ no output found for: ${event.rkey}`);
		return false;
	} catch (err) {
		const msg =
			(err as { stdout?: Buffer }).stdout?.toString().split('\n').slice(-5).join('\n') ??
			(err as Error).message;
		console.error(`  ✗ failed: ${event.rkey} — ${msg}`);
		return false;
	}
}

function main() {
	const modelPath = findModel();
	const events: VodEvent[] = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
	mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

	const toProcess = only ? events.filter((e) => e.rkey === only) : events;
	console.log(`Transcribing ${toProcess.length} VODs with whisper-cpp (model: ${modelPath})...\n`);

	let success = 0;
	let failed = 0;

	for (const event of toProcess) {
		if (transcribe(event, modelPath)) success++;
		else failed++;
	}

	console.log(`\nDone: ${success} transcribed, ${failed} failed`);
}

main();
