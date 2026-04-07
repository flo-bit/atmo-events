/**
 * Step 2: Download audio-only from HLS streams using ffmpeg.
 * Outputs 16kHz mono WAV — the exact format whisper-cpp expects.
 * ~30MB per hour of audio.
 * Output: data/audio/<rkey>.wav
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { AUDIO_DIR, EVENTS_FILE, type VodEvent } from './config.js';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

function isVodAvailable(url: string): boolean {
	try {
		execSync(`curl -sf -o /dev/null -w "%{http_code}" "${url}"`, {
			timeout: 15_000
		});
		return true;
	} catch {
		return false;
	}
}

function downloadAudio(event: VodEvent): 'ok' | 'skip' | 'fail' {
	const outPath = `${AUDIO_DIR}/${event.rkey}.wav`;
	if (existsSync(outPath)) {
		console.log(`  ✓ exists: ${event.rkey}`);
		return 'ok';
	}

	if (!isVodAvailable(event.playlistUrl)) {
		console.log(`  – 404, skipping: ${event.rkey} (${event.name})`);
		return 'skip';
	}

	try {
		// -vn: no video, -ar 16000 -ac 1: 16kHz mono (whisper-cpp native format)
		execSync(
			`ffmpeg -i "${event.playlistUrl}" -vn -ar 16000 -ac 1 -c:a pcm_s16le -y "${outPath}" 2>&1`,
			{ timeout: 600_000 }
		);
		if (!existsSync(outPath)) {
			console.error(`  ✗ no output file: ${event.rkey}`);
			return 'fail';
		}
		console.log(`  ✓ downloaded: ${event.rkey} (${event.name})`);
		return 'ok';
	} catch (err) {
		// Clean up partial file
		if (existsSync(outPath)) unlinkSync(outPath);
		const stderr =
			(err as { stdout?: Buffer }).stdout?.toString().split('\n').slice(-3).join('\n') ??
			(err as Error).message;
		console.error(`  ✗ failed: ${event.rkey} (${event.name})\n    ${stderr}`);
		return 'fail';
	}
}

function main() {
	const events: VodEvent[] = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
	mkdirSync(AUDIO_DIR, { recursive: true });

	const toProcess = only ? events.filter((e) => e.rkey === only) : events;
	console.log(`Downloading audio for ${toProcess.length} VODs...\n`);

	let success = 0;
	let skipped = 0;
	let failed = 0;

	for (const event of toProcess) {
		const result = downloadAudio(event);
		if (result === 'ok') success++;
		else if (result === 'skip') skipped++;
		else failed++;
	}

	console.log(`\nDone: ${success} downloaded, ${skipped} skipped (404), ${failed} failed`);
}

main();
