import { env } from 'cloudflare:workers';
import { ensureInit, getServerClient } from '#lib/contrail/index.js';
import { processBotMentions } from '#lib/bot/process-mentions.js';
import { refreshTopicCounts } from '#lib/server/topic-counts.js';
import { refreshCitySnapshot } from '#lib/server/cities.js';
import { syncEventStarterPacks } from '#lib/starter-packs/runtime.js';
import type { RequestHandler } from './$types';
import { getNotifications } from '#lib/notifications/server.js';
import { processNotifications, pruneNotificationState } from '#lib/notifications/process.js';
import { config } from '#lib/contrail.config.js';

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
	if (contrail) {
		try {
			const result = await processNotifications({
				db,
				stable: env.NOTIFY_DB,
				notify: await getNotifications(),
				client: getServerClient(db),
				now: Date.now(),
				epoch: config.orderedSource?.epoch,
				sources: [config.orderedSource?.source ?? 'jetstream', 'pds-notify']
			});
			if (result.failed) console.warn(`[notifications] ${result.failed} jobs will retry`);
		} catch (error) {
			console.error('[notifications] triggers failed:', error);
		}
	}
	// Delivery retries continue even if ingestion or trigger processing failed.
	try {
		const notify = await getNotifications();
		await notify.deliver({ limit: 50 });
		const now = Date.now();
		if (new Date(now).getUTCMinutes() < 2) {
			await notify.prune(now - 90 * 24 * 60 * 60_000);
			await pruneNotificationState(env.NOTIFY_DB, now);
		}
	} catch (error) {
		console.error('[notifications] delivery failed:', error);
	}
	// Public bot-owned packs reconcile after ingestion, independently of other jobs.
	try {
		await syncEventStarterPacks(env, db);
	} catch (error) {
		console.error('[starter-packs] sync failed:', error);
	}
	try {
		await refreshTopicCounts(db);
	} catch (error) {
		console.error('[cron] refreshTopicCounts failed:', error);
	}

	// Periodic global city membership/catalog; failures preserve the previous version.
	try {
		await refreshCitySnapshot(db);
	} catch (e) {
		console.error('[cron] refreshCitySnapshot failed:', e);
	}
	return new Response('OK');
};
