import { env } from 'cloudflare:workers';
import { createModerationReports, initModerationReports } from '@atmo-dev/contrail';
import { ensureInit } from '#lib/contrail/index.js';
import { moderatorDids } from './config';

export function isModerator(did: string | null | undefined): boolean {
	return !!did && moderatorDids(env.MODERATOR_DIDS).includes(did);
}

const ready = new WeakMap<D1Database, Promise<void>>();
export async function getReports() {
	if (!env.REPORTS_DB || env.REPORTS_DB === env.DB) {
		throw new Error('REPORTS_DB must be a separate, stable D1 binding');
	}
	let init = ready.get(env.REPORTS_DB);
	if (!init) {
		const db = env.REPORTS_DB;
		init = initModerationReports(db)
			.then(async () => {
				// App-owned durable publication intent. Keep it independent of report
				// resolution, whose shared implementation may replace action_uri.
				await db
					.prepare(
						`CREATE TABLE IF NOT EXISTS report_actions (
				report_id INTEGER PRIMARY KEY,
				uri TEXT NOT NULL UNIQUE,
				record TEXT NOT NULL,
				published INTEGER NOT NULL DEFAULT 0
			)`
					)
					.run();
			})
			.catch((error) => {
				ready.delete(db);
				throw error;
			});
		ready.set(db, init);
	}
	const [contrail] = await Promise.all([ensureInit(env.DB), init]);
	return createModerationReports({
		config: contrail.config,
		projectionDb: env.DB,
		reportsDb: env.REPORTS_DB
	});
}
