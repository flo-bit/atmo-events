import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { ensureInit } from '#lib/contrail/index.js';
import { readTopicCounts, refreshTopicCounts } from '#lib/server/topic-counts.js';
import type { PageServerLoad } from './$types';

const meta = {
	pageTitle: 'Browse Topics',
	pageDescription: 'Find events by topic on the open social web.'
};

export const load: PageServerLoad = async () => {
	try {
		const db = env.DB;
		if (!db) return { ...meta, topicCounts: null };
		// Vite does not run scheduled Workers. Bootstrap the local schema/cache
		// here; the persisted daily gate still prevents repeated calculations.
		// Production remains a single cache read, with refreshes owned by cron.
		if (dev) {
			try {
				await ensureInit(db);
				await refreshTopicCounts(db);
			} catch (error) {
				console.warn('[topics] local counts refresh failed:', error);
				// Still try the last successful snapshot, just as production does.
			}
		}
		const snapshot = await readTopicCounts(db);
		return { ...meta, topicCounts: snapshot?.counts ?? null };
	} catch (error) {
		// Includes first deployment before cron creates the cache. Browsing must
		// still work; unknown counts are omitted, never presented as zero.
		console.warn('[topics] cached counts unavailable:', error);
		return { ...meta, topicCounts: null };
	}
};
