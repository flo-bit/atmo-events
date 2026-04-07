/**
 * Step 4: Use Claude to generate chapters and summaries from transcripts.
 * Output: data/output/<rkey>.json
 *
 * Requires: ANTHROPIC_API_KEY env var, npm install anthropic
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
	TRANSCRIPTS_DIR,
	OUTPUT_DIR,
	EVENTS_FILE,
	type VodEvent,
	type TranscriptData,
	type VodOutput,
	type Chapter
} from './config.js';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const skipSummary = args.includes('--skip-summary');

async function getAnthropicClient() {
	const { default: Anthropic } = await import('anthropic');
	return new Anthropic();
}

function formatTranscriptForPrompt(transcript: TranscriptData): string {
	return transcript.segments
		.map((seg) => {
			const time = formatTime(seg.start);
			const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
			return `[${time}] ${speaker}${seg.text.trim()}`;
		})
		.join('\n');
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

async function generateChaptersAndSummary(
	event: VodEvent,
	transcript: TranscriptData,
	client: Awaited<ReturnType<typeof getAnthropicClient>>
): Promise<{ chapters: Chapter[]; summary: string }> {
	const formattedTranscript = formatTranscriptForPrompt(transcript);

	const prompt = `You are analyzing a conference talk transcript from AtmosphereConf, a conference about the AT Protocol / Bluesky ecosystem.

Talk: "${event.name}"
Speakers: ${event.speakers.join(', ') || 'Unknown'}
Description: ${event.description || 'No description provided'}

Here is the timestamped transcript:

${formattedTranscript}

Please provide:

1. **Chapters**: Break the talk into logical chapters/sections. Each chapter should have a start timestamp (in seconds), end timestamp (in seconds), and a short descriptive title. Aim for 3-8 chapters depending on talk length.

2. **Summary**: A concise summary of the talk (2-4 paragraphs) covering the key points, arguments, and takeaways.

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "chapters": [
    {"start": 0, "end": 120, "title": "Introduction"},
    {"start": 120, "end": 450, "title": "..."}
  ],
  "summary": "..."
}`;

	const response = await client.messages.create({
		model: 'claude-sonnet-4-20250514',
		max_tokens: 4096,
		messages: [{ role: 'user', content: prompt }]
	});

	const text = response.content
		.filter((c): c is { type: 'text'; text: string } => c.type === 'text')
		.map((c) => c.text)
		.join('');

	try {
		return JSON.parse(text);
	} catch {
		// Try to extract JSON from markdown code blocks
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[1]);
		}
		throw new Error(`Failed to parse Claude response as JSON: ${text.slice(0, 200)}`);
	}
}

async function processEvent(
	event: VodEvent,
	client: Awaited<ReturnType<typeof getAnthropicClient>>
): Promise<boolean> {
	const outFile = `${OUTPUT_DIR}/${event.rkey}.json`;
	if (existsSync(outFile)) {
		console.log(`  ✓ already processed: ${event.rkey}`);
		return true;
	}

	const transcriptFile = `${TRANSCRIPTS_DIR}/${event.rkey}.json`;
	if (!existsSync(transcriptFile)) {
		console.log(`  ✗ no transcript: ${event.rkey}`);
		return false;
	}

	const transcript: TranscriptData = JSON.parse(readFileSync(transcriptFile, 'utf-8'));

	let chapters: Chapter[] = [];
	let summary = '';

	if (!skipSummary) {
		try {
			console.log(`  ⏳ generating chapters/summary: ${event.rkey} (${event.name})...`);
			const result = await generateChaptersAndSummary(event, transcript, client);
			chapters = result.chapters;
			summary = result.summary;
			console.log(`  ✓ generated: ${event.rkey}`);
		} catch (err) {
			console.error(`  ✗ Claude failed for ${event.rkey}: ${(err as Error).message}`);
		}
	}

	const output: VodOutput = {
		rkey: event.rkey,
		name: event.name,
		speakers: event.speakers,
		description: event.description,
		transcript,
		chapters,
		summary
	};

	writeFileSync(outFile, JSON.stringify(output, null, 2));
	return true;
}

async function main() {
	const events: VodEvent[] = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
	mkdirSync(OUTPUT_DIR, { recursive: true });

	const toProcess = only ? events.filter((e) => e.rkey === only) : events;
	console.log(`Processing ${toProcess.length} transcripts...\n`);

	let client: Awaited<ReturnType<typeof getAnthropicClient>> | null = null;
	if (!skipSummary) {
		if (!process.env.ANTHROPIC_API_KEY) {
			console.log('⚠️  No ANTHROPIC_API_KEY set — chapters/summaries will be skipped.\n');
		} else {
			client = await getAnthropicClient();
		}
	}

	let success = 0;
	let failed = 0;

	for (const event of toProcess) {
		if (await processEvent(event, client!)) success++;
		else failed++;
	}

	console.log(`\nDone: ${success} processed, ${failed} failed`);
}

main();
