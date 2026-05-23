import { contrail, ensureInit } from '$lib/contrail/index';
import { processBotMentions } from '$lib/bot/process-mentions';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const secret = request.headers.get('X-Cron-Secret');
	if (secret !== platform!.env.CRON_SECRET) {
		return new Response('Unauthorized', { status: 401 });
	}

	const db = platform!.env.DB;

	// Reply bot runs first and is fully isolated: it must not be starved or
	// aborted by the heavier ingest below, which can throw (e.g. D1 CPU limits
	// while catching up a backlog). The bot relies on its own queries +
	// notifyOfUpdate, so it works even when firehose ingest is behind.
	try {
		await processBotMentions(platform!.env, db);
	} catch (e) {
		console.error('[bot] processBotMentions failed:', e);
	}

	// Firehose ingest — guarded so an over-budget cycle can't 500 the whole tick
	// (which previously also took the bot down with it).
	try {
		await ensureInit(db);
		await contrail.ingest({}, db);
	} catch (e) {
		console.error('[cron] contrail.ingest failed:', e);
	}

	return new Response('OK');
};
