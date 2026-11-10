import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';

const mocks = vi.hoisted(() => ({
	loadMore: vi.fn(async () => ({ events: [], handles: {}, cursor: null as string | null })),
	search: vi.fn<typeof fetch>()
}));
vi.mock('#lib/contrail/events.remote.js', () => ({ loadMoreEvents: mocks.loadMore }));

import CitiesPage from './+page.svelte';
import type { PageData } from './$types';

const base = {
	did: null,
	profile: null,
	canPostToBluesky: false,
	isModerator: false,
	pageTitle: 'Events nearby',
	pageDescription: 'Find upcoming events near you.'
};
const local: Extract<PageData, { mode: 'events' }> = {
	...base,
	mode: 'events',
	locationSource: 'selected',
	detected: { city: 'Berlin', country: 'DE', region: 'Berlin' },
	shown: { city: 'Berlin', country: 'DE', region: 'Berlin', count: 1 },
	noLocalEvents: false,
	radiusKm: 100,
	distanceKm: null,
	events: [],
	handles: {},
	cursor: null
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.search
		.mockReset()
		.mockImplementation(async () =>
			Response.json({ cities: [{ city: 'Munich', country: 'DE', region: 'Bavaria' }] })
		);
	vi.stubGlobal('fetch', mocks.search);
});
afterEach(async () => {
	vi.unstubAllGlobals();
	await page.viewport(1280, 1000);
});

describe('nearby events UI', () => {
	it('shows the city cards immediately, filters while typing and restores them when cleared', async () => {
		await page.viewport(390, 844);
		const cities = Array.from({ length: 12 }, (_, i) => ({
			city: `City ${i}`,
			country: 'DE',
			region: ''
		}));
		await render(CitiesPage, { data: { ...base, mode: 'choose', search: '', cities } });
		const cards = page.getByRole('list', { name: 'Cities' });
		expect(cards.getByRole('link').elements()).toHaveLength(12);
		const input = page.getByRole('textbox', { name: 'City', exact: true });
		await input.fill('München');
		await expect
			.element(page.getByRole('button', { name: 'Search', exact: true }))
			.not.toBeInTheDocument();
		const choice = page.getByRole('link', { name: 'Munich Bavaria, Germany' });
		await expect.element(choice).toHaveAttribute('data-sveltekit-preload-data', 'off');
		await expect
			.element(choice)
			.toHaveAttribute('href', '/cities?city=Munich&country=DE&region=Bavaria');
		expect(mocks.search).toHaveBeenCalledWith('/api/cities?q=M%C3%BCnchen', {
			signal: expect.any(AbortSignal)
		});
		const select = vi.fn((event: Event) => event.preventDefault());
		choice.element().addEventListener('click', select, { once: true });
		await userEvent.keyboard('{Tab}{Enter}');
		expect(select).toHaveBeenCalledOnce();
		await input.fill('');
		await expect.poll(() => cards.getByRole('link').elements().length).toBe(12);
		await page.getByRole('heading', { name: 'Choose a city' }).click();
		expect(cards.getByRole('link').elements()).toHaveLength(12);
	});
	it('ignores an outdated search response after the query changes', async () => {
		let finish!: (response: Response) => void;
		const pending = new Promise<Response>((resolve) => {
			finish = resolve;
		});
		mocks.search
			.mockImplementationOnce(() => pending)
			.mockImplementation(async () =>
				Response.json({ cities: [{ city: 'Berlin', country: 'DE', region: 'Berlin' }] })
			);
		await render(CitiesPage, { data: { ...base, mode: 'choose', search: '', cities: [] } });
		const input = page.getByRole('textbox', { name: 'City', exact: true });
		await input.fill('par');
		await expect.poll(() => mocks.search.mock.calls.length).toBe(1);
		const signal = mocks.search.mock.calls[0][1]?.signal;
		await input.fill('ber');
		await expect.element(page.getByRole('link', { name: 'Berlin Berlin, Germany' })).toBeVisible();
		expect(signal?.aborted).toBe(true);
		finish(Response.json({ cities: [{ city: 'Paris', country: 'FR', region: '' }] }));
		await pending;
		await expect.element(page.getByRole('link', { name: 'Paris France' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Berlin Berlin, Germany' })).toBeVisible();
	});
	it('allows retrying failed searches without hiding city cards on blur', async () => {
		mocks.search.mockResolvedValueOnce(new Response(null, { status: 503 }));
		await render(CitiesPage, { data: { ...base, mode: 'choose', search: '', cities: [] } });
		const input = page.getByRole('textbox', { name: 'City', exact: true });
		await input.fill('mun');
		await page.getByRole('button', { name: 'Retry', exact: true }).click();
		await expect.element(page.getByRole('link', { name: 'Munich Bavaria, Germany' })).toBeVisible();
		await page.getByRole('heading', { name: 'Choose a city' }).click();
		await expect.element(page.getByRole('link', { name: 'Munich Bavaria, Germany' })).toBeVisible();
	});
	it('keeps the empty state brief with only the city-change control', async () => {
		await render(CitiesPage, { data: { ...local, shown: null, noLocalEvents: true } });
		await expect.element(page.getByText('No nearby events.', { exact: true })).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Change city' })).toBeVisible();
		await expect.element(page.getByRole('link', { name: /IP location/ })).not.toBeInTheDocument();
	});
	it('keeps load-more usable when a sparse snapshot page has no live events yet', async () => {
		await render(CitiesPage, { data: { ...local, cursor: 'remaining-city-events' } });
		await page.getByRole('button', { name: 'Load more', exact: true }).click();
		expect(mocks.loadMore).toHaveBeenCalledExactlyOnceWith({ cursor: 'remaining-city-events' });
		await expect
			.element(page.getByRole('button', { name: 'Load more', exact: true }))
			.not.toBeInTheDocument();
	});
	it('does not resume the previous city when its pending load-more finishes after a switch', async () => {
		let finish!: (value: Awaited<ReturnType<typeof mocks.loadMore>>) => void;
		const pending = new Promise<Awaited<ReturnType<typeof mocks.loadMore>>>((resolve) => {
			finish = resolve;
		});
		mocks.loadMore.mockImplementationOnce(() => pending);
		const view = await render(CitiesPage, { data: { ...local, cursor: 'berlin-page-2' } });
		await page.getByRole('button', { name: 'Load more', exact: true }).click();
		const potsdam = { city: 'Potsdam', country: 'DE', region: 'Brandenburg' };
		await view.rerender({
			data: {
				...local,
				detected: potsdam,
				shown: { ...potsdam, count: 1 },
				cursor: 'potsdam-page-2'
			}
		});
		finish({ events: [], handles: {}, cursor: 'berlin-page-3' });
		await pending;
		await page.getByRole('button', { name: 'Load more', exact: true }).click();
		expect(mocks.loadMore).toHaveBeenLastCalledWith({ cursor: 'potsdam-page-2' });
	});
	it('provides recovery when the snapshot is unavailable', async () => {
		await render(CitiesPage, { data: { ...base, mode: 'unavailable' } });
		await expect
			.element(page.getByRole('link', { name: 'Try again' }))
			.toHaveAttribute('href', '/cities');
	});
});
