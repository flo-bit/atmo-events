import { describe, expect, it, vi } from 'vitest';
import { PreferredClientCache, PREFERRED_CLIENT_TTL_MS } from './preferred-client.svelte';

const ALICE = 'did:plc:alice';
const BOB = 'did:plc:bob';
const KEY = `atmo:preferred-client:v1:${ALICE}`;
const response = (did = ALICE, value: unknown = { client: 'mu' }) => Response.json({ did, value });

function setup() {
	let now = 1_000_000_000;
	const items = new Map<string, string>();
	const storage = {
		getItem: vi.fn((key: string) => items.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => void items.set(key, value))
	};
	const transport = vi.fn<typeof fetch>().mockImplementation(async () => response());
	const dependencies = { fetch: transport, storage: () => storage, now: () => now };
	return {
		cache: new PreferredClientCache(dependencies),
		dependencies,
		items,
		storage,
		transport,
		advance: (ms: number) => (now += ms),
		seed: (value: unknown, age = 0) =>
			items.set(KEY, JSON.stringify({ value, fetchedAt: now - age }))
	};
}

function deferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((r) => (resolve = r));
	return { promise, resolve };
}

describe('preferred social-client browser cache', () => {
	it('does not request anything while signed out', async () => {
		const { cache, transport } = setup();
		await cache.load(null);
		expect(cache.value(null)).toBeNull();
		expect(transport).not.toHaveBeenCalled();
	});
	it('uses a fresh persistent entry without a request, including across reloads', async () => {
		const { cache, dependencies, transport, seed } = setup();
		seed({ client: 'blacksky' });
		await cache.load(ALICE);
		expect(cache.value(ALICE)).toEqual({ client: 'blacksky' });
		const reloaded = new PreferredClientCache(dependencies);
		await reloaded.load(ALICE);
		expect(reloaded.value(ALICE)).toEqual({ client: 'blacksky' });
		expect(transport).not.toHaveBeenCalled();
	});
	it('fetches only once for a cache miss and persists the parsed value', async () => {
		const { cache, transport, items } = setup();
		await Promise.all([cache.load(ALICE), cache.load(ALICE)]);
		await cache.load(ALICE);
		expect(cache.value(ALICE)).toEqual({ client: 'mu' });
		expect(transport).toHaveBeenCalledExactlyOnceWith(
			'/api/preferred-client',
			expect.objectContaining({
				credentials: 'same-origin',
				cache: 'no-store',
				signal: expect.any(AbortSignal)
			})
		);
		expect(JSON.parse(items.get(KEY)!)).toMatchObject({ value: { client: 'mu' } });
	});
	it('caches authoritative absence for seven days too', async () => {
		const { cache, transport, advance } = setup();
		transport.mockImplementation(async () => response(ALICE, null));
		await cache.load(ALICE);
		advance(PREFERRED_CLIENT_TTL_MS - 1);
		await cache.load(ALICE);
		expect(transport).toHaveBeenCalledTimes(1);
		advance(1);
		await cache.load(ALICE);
		expect(transport).toHaveBeenCalledTimes(2);
	});
	it('immediately serves stale data while refreshing it in the background', async () => {
		const { cache, transport, seed } = setup();
		seed({ client: 'blacksky' }, PREFERRED_CLIENT_TTL_MS);
		const request = deferred();
		transport.mockReturnValue(request.promise);
		const loading = cache.load(ALICE);
		expect(cache.value(ALICE)).toEqual({ client: 'blacksky' });
		request.resolve(response());
		await loading;
		expect(cache.value(ALICE)).toEqual({ client: 'mu' });
	});
	it.each(['network', 'http', 'malformed', 'wrong account'])(
		'preserves stale data and its original expiry after a %s failure',
		async (failure) => {
			const { cache, transport, seed, items } = setup();
			seed({ client: 'blacksky' }, PREFERRED_CLIENT_TTL_MS);
			const original = items.get(KEY);
			transport.mockImplementation(async () => {
				if (failure === 'network') throw new Error('offline');
				if (failure === 'http') return new Response(null, { status: 502 });
				if (failure === 'wrong account') return response(BOB);
				return response(ALICE, { client: 'invalid' });
			});
			await cache.load(ALICE);
			expect(cache.value(ALICE)).toEqual({ client: 'blacksky' });
			expect(items.get(KEY)).toBe(original);
			await cache.load(ALICE);
			expect(transport).toHaveBeenCalledTimes(2);
		}
	);
	it('uses memory when persistent storage is unavailable', async () => {
		const { cache, storage, transport } = setup();
		storage.getItem.mockImplementation(() => {
			throw new Error('blocked');
		});
		storage.setItem.mockImplementation(() => {
			throw new Error('quota');
		});
		await cache.load(ALICE);
		await cache.load(ALICE);
		expect(cache.value(ALICE)).toEqual({ client: 'mu' });
		expect(transport).toHaveBeenCalledTimes(1);
	});
	it.each([
		'not json',
		'{}',
		'{"value":{"client":"invalid"},"fetchedAt":1}',
		'{"value":null,"fetchedAt":1e30}'
	])('treats invalid storage as a cache miss: %s', async (raw) => {
		const { cache, items, transport } = setup();
		items.set(KEY, raw);
		await cache.load(ALICE);
		expect(cache.value(ALICE)).toEqual({ client: 'mu' });
		expect(transport).toHaveBeenCalledTimes(1);
	});
	it('never leaks another account’s selection and discards responses from a previous login', async () => {
		const { cache, transport, seed, items } = setup();
		seed({ client: 'blacksky' }, PREFERRED_CLIENT_TTL_MS);
		const oldRequest = deferred();
		transport
			.mockReturnValueOnce(oldRequest.promise)
			.mockImplementation(async () => response(BOB, { client: 'bluesky' }));
		const aliceLoading = cache.load(ALICE);
		await Promise.resolve();
		const bobLoading = cache.load(BOB);
		expect(cache.value(ALICE)).toBeNull();
		expect(cache.value(BOB)).toBeNull();
		await bobLoading;
		oldRequest.resolve(response());
		await aliceLoading;
		expect(cache.value(BOB)).toEqual({ client: 'bluesky' });
		expect(JSON.parse(items.get(KEY)!)).toMatchObject({ value: { client: 'blacksky' } });
		await cache.load(null);
		expect(cache.value(BOB)).toBeNull();
	});
	it('a successful Settings save supersedes an older background response', async () => {
		const { cache, transport, items } = setup();
		const oldRequest = deferred();
		transport.mockReturnValue(oldRequest.promise);
		const loading = cache.load(ALICE);
		await Promise.resolve();
		cache.remember(ALICE, { client: 'blacksky' });
		oldRequest.resolve(response());
		await loading;
		expect(cache.value(ALICE)).toEqual({ client: 'blacksky' });
		expect(JSON.parse(items.get(KEY)!)).toMatchObject({ value: { client: 'blacksky' } });
	});
	it('a fresh Settings read in the same render avoids a redundant background request', async () => {
		const { cache, transport } = setup();
		const loading = cache.load(ALICE);
		cache.remember(ALICE, { client: 'mu' });
		await loading;
		expect(transport).not.toHaveBeenCalled();
		expect(cache.value(ALICE)).toEqual({ client: 'mu' });
	});
});
