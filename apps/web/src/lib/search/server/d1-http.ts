// Thin Cloudflare D1 REST client for the external geocode job, which runs off
// Cloudflare (no Worker D1 binding). One parameterized-query method; the job
// does all its reads/writes through it.
export interface D1HttpConfig {
	accountId: string;
	databaseId: string;
	apiToken: string;
}

export interface D1Client {
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function createD1Client(cfg: D1HttpConfig, fetchImpl: typeof fetch = fetch): D1Client {
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`;
	return {
		async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
			const res = await fetchImpl(endpoint, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${cfg.apiToken}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ sql, params })
			});
			if (!res.ok) throw new Error(`D1 query failed: ${res.status}`);
			const body = (await res.json()) as {
				success: boolean;
				result?: Array<{ results: T[] }>;
				errors?: Array<{ message?: string }>;
			};
			if (!body.success) {
				const msg =
					body.errors
						?.map((e) => e.message)
						.filter(Boolean)
						.join('; ') || 'unknown D1 error';
				throw new Error(`D1 query error: ${msg}`);
			}
			return body.result?.[0]?.results ?? [];
		}
	};
}
