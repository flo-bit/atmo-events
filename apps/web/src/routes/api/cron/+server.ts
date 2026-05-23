import { contrail, ensureInit } from '$lib/contrail/index';
import { processBotMentions } from '$lib/bot/process-mentions';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const secret = request.headers.get('X-Cron-Secret');
	if (secret !== platform!.env.CRON_SECRET) {
		return new Response('Unauthorized', { status: 401 });
	}

	const db = platform!.env.DB;
	await ensureInit(db);
	await contrail.ingest({}, db);

	// Reply bot — isolated so its failures never break firehose ingest.
	try {
		await processBotMentions(platform!.env, db);
	} catch (e) {
		console.error('[bot] processBotMentions failed:', e);
	}

	return new Response('OK');
};
