import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, tick } from 'svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

const mocks = vi.hoisted(() => ({
	setData: vi.fn<(data: { did: string | null }) => void>()
}));
vi.mock('$app/state', async () => {
	const { writable, fromStore } = await import('svelte/store');
	const data = writable<{ did: string | null }>({ did: null });
	mocks.setData.mockImplementation(data.set);
	const reactive = fromStore(data);
	return {
		page: {
			get data() {
				return reactive.current;
			},
			error: null,
			status: 200
		}
	};
});
import Layout from '../../routes/+layout.svelte';
import { preferredClientCache } from './preferred-client.svelte';

const DID = 'did:plc:preferredcachebrowser';
const KEY = `atmo:preferred-client:v1:${DID}`;
const mount = () =>
	render(Layout, {
		children: createRawSnippet(() => ({ render: () => '<main>Event content</main>' }))
	});

beforeEach(() => {
	localStorage.removeItem(KEY);
	mocks.setData({ did: null });
	void preferredClientCache.load(null);
});
afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.removeItem(KEY);
});

describe('preferred client root-layout integration', () => {
	it('renders page content without waiting for a preference request, then selects the result', async () => {
		let resolve!: (response: Response) => void;
		const pending = new Promise<Response>((r) => {
			resolve = r;
		});
		const transport = vi.fn<typeof fetch>().mockReturnValue(pending);
		vi.stubGlobal('fetch', transport);
		mocks.setData({ did: DID });
		await mount();
		await expect.element(page.getByText('Event content')).toBeVisible();
		expect(preferredClientCache.value(DID)).toBeNull();
		expect(transport).toHaveBeenCalledTimes(1);

		resolve(Response.json({ did: DID, value: { client: 'mu' } }));
		await vi.waitFor(() => expect(preferredClientCache.value(DID)).toEqual({ client: 'mu' }));
		expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ value: { client: 'mu' } });

		mocks.setData({ did: null });
		await tick();
		expect(preferredClientCache.value(DID)).toBeNull();
		mocks.setData({ did: DID });
		await tick();
		expect(preferredClientCache.value(DID)).toEqual({ client: 'mu' });
		expect(transport).toHaveBeenCalledTimes(1);
	});
	it('does not read the preference while signed out', async () => {
		const transport = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', transport);
		await mount();
		await expect.element(page.getByText('Event content')).toBeVisible();
		expect(transport).not.toHaveBeenCalled();
	});
});
