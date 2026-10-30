import type { Client } from '@atcute/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForPackIndex } from './indexed';

const url = 'https://bsky.app/starter-pack/did:plc:bot/pack';
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});
describe('Bluesky indexing lag', () => {
	it('does not delay an already indexed pack', async () => {
		const get = vi.fn().mockResolvedValue({ ok: true });
		await waitForPackIndex({ get } as unknown as Client, url);
		expect(get).toHaveBeenCalledTimes(1);
		expect(get.mock.calls[0][1].params).toEqual({
			starterPack: 'at://did:plc:bot/app.bsky.graph.starterpack/pack'
		});
	});
	it('waits briefly for a newly published pack', async () => {
		vi.useFakeTimers();
		const get = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
		const ready = waitForPackIndex({ get } as unknown as Client, url);
		await vi.advanceTimersByTimeAsync(400);
		await ready;
		expect(get).toHaveBeenCalledTimes(2);
	});
	it('bounds retries and tolerates AppView failures after successful publication', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const get = vi.fn().mockRejectedValue(new Error('AppView unavailable'));
		const ready = waitForPackIndex({ get } as unknown as Client, url);
		await vi.advanceTimersByTimeAsync(1_200);
		await expect(ready).resolves.toBeUndefined();
		expect(get).toHaveBeenCalledTimes(4);
	});
});
