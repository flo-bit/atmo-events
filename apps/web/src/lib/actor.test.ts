import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveHandle: vi.fn() }));
vi.mock('@svelte-atproto/oauth/helper', () => mocks);
const did = 'did:plc:abcdefghijklmnopqrstuvwx';

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('app actor resolution', () => {
	it('does not perform a lookup for a DID', async () => {
		const { actorToDid } = await import('./actor');
		expect(await actorToDid(did)).toBe(did);
		expect(mocks.resolveHandle).not.toHaveBeenCalled();
	});

	it('uses the library while keeping successful handle lookups cached', async () => {
		mocks.resolveHandle.mockResolvedValue(did);
		const { actorToDid } = await import('./actor');
		expect(await actorToDid('alice.test')).toBe(did);
		expect(await actorToDid('alice.test')).toBe(did);
		expect(mocks.resolveHandle).toHaveBeenCalledExactlyOnceWith({
			handle: 'alice.test',
			doh: 'https://mozilla.cloudflare-dns.com/dns-query',
			slingshot: false
		});
		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		await actorToDid('alice.test');
		expect(mocks.resolveHandle).toHaveBeenCalledTimes(2);
	});

	it('retries a transient failure rather than turning it into a not-found page', async () => {
		mocks.resolveHandle.mockRejectedValueOnce(new Error('DNS unavailable')).mockResolvedValue(did);
		const { getActor } = await import('./actor');
		const result = getActor('alice.test');
		await vi.runAllTimersAsync();
		expect(await result).toBe(did);
		expect(mocks.resolveHandle).toHaveBeenCalledTimes(2);
	});

	it('does not cache failed lookups', async () => {
		mocks.resolveHandle.mockRejectedValue(new Error('unresolved'));
		const { getActor } = await import('./actor');
		const result = getActor('alice.test');
		await vi.runAllTimersAsync();
		expect(await result).toBeNull();
		expect(mocks.resolveHandle).toHaveBeenCalledTimes(3);
		mocks.resolveHandle.mockResolvedValue(did);
		expect(await getActor('alice.test')).toBe(did);
		expect(mocks.resolveHandle).toHaveBeenCalledTimes(4);
	});
});
