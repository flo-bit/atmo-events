import { getBotHandle } from '#lib/bot/session.js';
import { getServerClient } from '#lib/contrail/index.js';
import { StarterPackService } from './service';
import { loadPackSource } from './source';
import { waitForPackIndex } from './indexed';
import { withDeadline } from './deadline';

function service(bot: NonNullable<Awaited<ReturnType<typeof getBotHandle>>>, db: D1Database) {
	return new StarterPackService(bot.client, bot.did, (uri, signal) =>
		loadPackSource(getServerClient(db), bot.client, uri, signal)
	);
}

export async function getEventStarterPack(env: Cloudflare.Env, uri: string): Promise<string> {
	const bot = await getBotHandle(env);
	if (!bot) throw new Error('Starter packs are unavailable');
	try {
		const url = await service(bot, env.DB).getOrCreate(uri);
		await waitForPackIndex(bot.client, url);
		return url;
	} finally {
		await bot.flush();
	}
}

const REFRESH_INTERVAL_MS = 5 * 60_000;
const MAX_PACKS_PER_RUN = 5;

/** The bot's mapping collection is the worklist. No D1 registry, cursor or sync table. */
export async function syncEventStarterPacks(env: Cloudflare.Env, db: D1Database): Promise<void> {
	if (!env.BOT_IDENTIFIER || !env.BOT_APP_PASSWORD) return;
	const bot = await getBotHandle(env);
	if (!bot) return;
	try {
		const packs = service(bot, db);
		// One shared budget includes mapping pagination and every pack/batch. A
		// slow event must leave time for the cron's topic/city jobs to run too.
		await withDeadline(30_000, undefined, async (signal) => {
			const mappings = await packs.mappings(signal);
			const attemptedAt = (value: string | undefined) => {
				const time = Date.parse(value ?? '');
				return Number.isFinite(time) ? time : 0;
			};
			const due = mappings
				.filter((mapping) => attemptedAt(mapping.lastAttemptAt) <= Date.now() - REFRESH_INTERVAL_MS)
				.sort((a, b) => attemptedAt(a.lastAttemptAt) - attemptedAt(b.lastAttemptAt))
				.slice(0, MAX_PACKS_PER_RUN);
			for (const mapping of due) {
				if (signal.aborted) break;
				try {
					await packs.reconcile(mapping.event, signal);
				} catch (error) {
					console.error('[starter-packs] refresh failed', mapping.event, error);
					try {
						// Backoff is a separate, bounded write even if the run expired.
						await packs.defer(mapping.event);
					} catch (deferError) {
						console.error('[starter-packs] could not save retry backoff', deferError);
					}
				}
			}
		});
	} finally {
		await bot.flush();
	}
}
