/**
 * Downloads all matched ATmosphereConf VOD MP4s using ffmpeg.
 * Uses the HLS playlist URL so both audio and video are muxed properly.
 *
 * Requires: ffmpeg
 *
 * Usage: npx tsx scripts/download-vods.ts [output-dir] [filter]
 *
 * Default output dir: ./vods
 * Optional filter: case-insensitive substring match on event title
 */

import { existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import vodMap from '../src/lib/vod-map.json';

const STREAM_PLACE_DID = 'did:plc:rbvrr34edl5ddpuwcubjiost';
const PLAYBACK_BASE = 'https://vod-beta.stream.place/xrpc/place.stream.playback.getVideoPlaylist';

const outDir = process.argv[2] || './vods';
const filter = process.argv[3]?.toLowerCase();

function sanitizeFilename(name: string): string {
	return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function getPlaylistUrl(vodRkey: string): string {
	const uri = `at://${STREAM_PLACE_DID}/place.stream.video/${vodRkey}`;
	return `${PLAYBACK_BASE}?uri=${encodeURIComponent(uri)}`;
}

function downloadWithFfmpeg(playlistUrl: string, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = execFile(
			'ffmpeg',
			[
				'-y',
				'-i', playlistUrl,
				'-c', 'copy',
				dest
			],
			{ maxBuffer: 10 * 1024 * 1024 },
			(err) => {
				if (err) reject(err);
				else resolve();
			}
		);

		// Show ffmpeg progress
		proc.stderr?.on('data', (data: Buffer) => {
			const line = data.toString();
			const timeMatch = line.match(/time=(\d+:\d+:\d+\.\d+)/);
			if (timeMatch) {
				process.stdout.write(`\r          time: ${timeMatch[1]}  `);
			}
		});
	});
}

async function main() {
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

	const entries = filter
		? vodMap.filter((e) => e.eventTitle.toLowerCase().includes(filter))
		: vodMap;

	if (entries.length === 0) {
		console.log(`No VODs matching "${filter}"`);
		return;
	}

	console.log(`Downloading ${entries.length} VOD${entries.length > 1 ? 's' : ''} to ${outDir}/\n`);

	let downloaded = 0;
	let skipped = 0;
	let failed = 0;

	for (const entry of entries) {
		const filename = `${sanitizeFilename(entry.eventTitle)}.mp4`;
		const dest = `${outDir}/${filename}`;

		if (existsSync(dest)) {
			console.log(`  SKIP  ${filename} (already exists)`);
			skipped++;
			continue;
		}

		console.log(`  GET   ${filename}`);

		try {
			const playlistUrl = getPlaylistUrl(entry.vodRkey);
			await downloadWithFfmpeg(playlistUrl, dest);
			process.stdout.write('\r          done                    \n');
			downloaded++;
		} catch (e) {
			process.stdout.write('\n');
			console.log(`          FAILED (${e instanceof Error ? e.message : e})`);
			failed++;
		}
	}

	console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
