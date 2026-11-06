import { afterEach, describe, expect, it, vi } from 'vitest';

// The real lookup, so this needs the network the page really uses, with its fetch stubbed.
vi.mock('#lib/atproto/network.js', async () => {
	const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
	const standard = createAtprotoNetwork({ fetch: (input, init) => globalThis.fetch(input, init) });
	return { atprotoNetwork: () => standard };
});
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: () => true,
	spacesServer: () => null
}));

const view = await import('./+page.server');
const edit = await import('./edit/+page.server');

const input = {
	params: { actor: 'stalled-host.test', rkey: '3lzzzzzzzzzzz' },
	locals: {},
	setHeaders: () => {}
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('a host whose handle never answers', () => {
	it.each([
		['the event page', () => view.load(input as never)],
		['the edit page', () => edit.load(input as never)]
	])('%s answers rather than waiting on it', { timeout: 2000 }, async (_name, load) => {
		const realTimeout = AbortSignal.timeout.bind(AbortSignal);
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
		vi.stubGlobal(
			'fetch',
			(_input: unknown, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				})
		);
		await expect(load()).rejects.toMatchObject({ status: 404 });
	});
});
