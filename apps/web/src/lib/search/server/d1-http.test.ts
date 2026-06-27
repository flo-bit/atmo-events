import { describe, it, expect, vi } from 'vitest';
import { createD1Client } from './d1-http';

const CFG = { accountId: 'acct', databaseId: 'db', apiToken: 'tok' };

function fakeFetch(body: unknown, status = 200) {
	const calls: { url: string; method: string; auth: string; body: unknown }[] = [];
	const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? 'GET',
			auth: (init?.headers as Record<string, string>)?.authorization ?? '',
			body: init?.body ? JSON.parse(String(init.body)) : undefined
		});
		return new Response(JSON.stringify(body), { status });
	});
	return { fn: fn as unknown as typeof fetch, calls };
}

describe('createD1Client.query', () => {
	it('POSTs sql+params to the D1 query endpoint and returns the first result set', async () => {
		const { fn, calls } = fakeFetch({
			success: true,
			result: [{ results: [{ uri: 'at://x' }], success: true }]
		});
		const rows = await createD1Client(CFG, fn).query(
			'SELECT uri FROM records_event WHERE did = ?',
			['did:plc:a']
		);
		expect(rows).toEqual([{ uri: 'at://x' }]);
		expect(calls[0].url).toBe(
			'https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/query'
		);
		expect(calls[0].method).toBe('POST');
		expect(calls[0].auth).toBe('Bearer tok');
		expect(calls[0].body).toEqual({
			sql: 'SELECT uri FROM records_event WHERE did = ?',
			params: ['did:plc:a']
		});
	});

	it('returns [] when the result set is empty', async () => {
		const { fn } = fakeFetch({ success: true, result: [{ results: [], success: true }] });
		expect(await createD1Client(CFG, fn).query('SELECT 1')).toEqual([]);
	});

	it('throws on an HTTP error', async () => {
		const { fn } = fakeFetch({}, 401);
		await expect(createD1Client(CFG, fn).query('SELECT 1')).rejects.toThrow(/401/);
	});

	it('throws on a D1 error envelope (success:false)', async () => {
		const { fn } = fakeFetch({ success: false, errors: [{ message: 'bad sql' }] });
		await expect(createD1Client(CFG, fn).query('SELECT')).rejects.toThrow(/bad sql/);
	});

	it('falls back to "unknown D1 error" when all error objects lack a message', async () => {
		const { fn } = fakeFetch({ success: false, errors: [{}, {}] });
		await expect(createD1Client(CFG, fn).query('SELECT 1')).rejects.toThrow(/unknown D1 error/);
	});
});
