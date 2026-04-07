/**
 * Full VOD processing pipeline:
 *   1. Fetch events with VODs from API
 *   2. Download audio (m4a, no video)
 *   3. Transcribe with whisperx (word timestamps + speaker diarization)
 *   4. Generate chapters + summaries with Claude
 *
 * Usage:
 *   tsx scripts/vod-processing/pipeline.ts [options]
 *
 * Options:
 *   --step=<1-4>         Run only a specific step
 *   --only=<rkey>        Process only a specific event
 *   --skip-diarize       Skip speaker diarization
 *   --skip-summary       Skip Claude chapters/summary generation
 *   --hf-token=<token>   HuggingFace token for pyannote (or set HF_TOKEN)
 *   --model=<model>      Whisper model (default: large-v3)
 *   --batch-size=<n>     Whisper batch size (default: 16)
 *
 * Prerequisites:
 *   brew install ffmpeg
 *   pip install whisperx
 *   npm install anthropic (for summaries)
 *
 * For speaker diarization:
 *   1. Create HuggingFace account
 *   2. Accept pyannote/speaker-diarization-3.1 terms
 *   3. Accept pyannote/segmentation-3.0 terms
 *   4. Set HF_TOKEN=<your-token>
 */

import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const step = args.find((a) => a.startsWith('--step='))?.split('=')[1];
const passthrough = args.filter((a) => !a.startsWith('--step=')).join(' ');

const SCRIPTS_DIR = new URL('.', import.meta.url).pathname;

function run(script: string) {
	execSync(`tsx ${SCRIPTS_DIR}${script} ${passthrough}`, {
		stdio: 'inherit',
		timeout: 86_400_000 // 24h for full pipeline
	});
}

const steps: Record<string, [string, string]> = {
	'1': ['fetch-events.ts', 'Fetching events'],
	'2': ['download-audio.ts', 'Downloading audio'],
	'3': ['transcribe.ts', 'Transcribing'],
	'4': ['summarize.ts', 'Generating chapters & summaries']
};

if (step) {
	const s = steps[step];
	if (!s) {
		console.error(`Unknown step: ${step}. Use 1-4.`);
		process.exit(1);
	}
	console.log(`\n═══ Step ${step}: ${s[1]} ═══\n`);
	run(s[0]);
} else {
	for (const [num, [script, label]] of Object.entries(steps)) {
		console.log(`\n═══ Step ${num}: ${label} ═══\n`);
		run(script);
	}
}
