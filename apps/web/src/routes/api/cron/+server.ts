import { env } from 'cloudflare:workers';
import { ensureInit } from '#lib/contrail/index.js';
import { processBotMentions } from '#lib/bot/process-mentions.js';
import { refreshTopicCounts } from '#lib/server/topic-counts.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!env.CRON_SECRET || request.headers.get('X-Cron-Secret') !== env.CRON_SECRET) {
		return new Response('Unauthorized', { status: 401 });
	}
	const db = env.DB;
	try {
		await processBotMentions(env, db);
	} catch (error) {
		console.error('[bot] processBotMentions failed:', error);
	}

	let contrail: Awaited<ReturnType<typeof ensureInit>> | undefined;
	try {
		contrail = await ensureInit(db);
		// Contrail bounds retained records, identity updates, bytes and drain time,
		// and commits projection/checkpoints transactionally. No uncancelled race.
		await contrail.ingest({ maxDrainMs: 20_000, maxCandidates: 250 }, db);
	} catch (error) {
		console.error('[cron] ingest cycle failed:', error);
	}
	if (contrail) {
		try {
			await contrail.retryBackfill({ maxAccounts: 5 }, db);
		} catch (error) {
			console.error('[cron] backfill retries failed:', error);
		}
	}
	try {
		await refreshTopicCounts(db);
	} catch (error) {
		console.error('[cron] refreshTopicCounts failed:', error);
	}
	return new Response('OK');
};
