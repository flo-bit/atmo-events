// Adapt the native Worker D1 binding (platform.env.DB) to the D1Client interface
// the geocode job uses. Lets the same core run in-Worker (the cron drip) over the
// native binding — no REST endpoint, no CLOUDFLARE_API_TOKEN — while the off-box
// CLI keeps the HTTP client in d1-http.ts. One parameterized-query method, the
// only surface the job needs.
import type { D1Client } from './d1-http';

export function nativeD1Client(db: D1Database): D1Client {
	return {
		async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
			const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
			const { results } = await stmt.all<T>();
			return results ?? [];
		}
	};
}
