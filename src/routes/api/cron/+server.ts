import { contrail, ensureInit } from '$lib/contrail/index';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const secret = request.headers.get('X-Cron-Secret');
	if (secret !== platform!.env.CRON_SECRET) {
		console.warn('[cron] Unauthorized request (bad or missing X-Cron-Secret)');
		return new Response('Unauthorized', { status: 401 });
	}

	const db = platform!.env.DB;
	const startedAt = Date.now();
	console.log('[cron] Ingestion cycle starting');

	try {
		await ensureInit(db);
		await contrail.ingest({}, db);
		const elapsed = Date.now() - startedAt;

		const eventCountRow = await db
			.prepare(
				"SELECT COUNT(*) AS n FROM records_community_lexicon_calendar_event"
			)
			.first<{ n: number }>()
			.catch((err) => {
				console.warn('[cron] Could not count event rows:', err);
				return null;
			});
		const cursorRow = await db
			.prepare('SELECT time_us FROM cursor WHERE id = 1')
			.first<{ time_us: number }>()
			.catch(() => null);

		const cursorIso = cursorRow?.time_us
			? new Date(cursorRow.time_us / 1000).toISOString()
			: 'none';
		const lagMs = cursorRow?.time_us ? Date.now() - cursorRow.time_us / 1000 : null;

		console.log(
			`[cron] Ingestion cycle complete in ${elapsed}ms. total_events=${eventCountRow?.n ?? '?'} cursor=${cursorIso} lag=${lagMs === null ? '?' : `${lagMs}ms`}`
		);
	} catch (err) {
		const elapsed = Date.now() - startedAt;
		console.error(`[cron] Ingestion FAILED after ${elapsed}ms:`, err);
		return new Response('Ingestion failed', { status: 500 });
	}

	return new Response('OK');
};
