import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';

const mocks = vi.hoisted(() => ({
	loadMore: vi.fn(async () => ({ events: [], handles: {}, cursor: null as string | null }))
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
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
	await page.viewport(1280, 1000);
});

describe('nearby events UI', () => {
	it('offers an accessible city search and does not preload preference-changing links', async () => {
		await page.viewport(390, 844);
		await render(CitiesPage, {
			data: {
				...base,
				mode: 'choose',
				search: '',
				cities: [{ city: 'Munich', country: 'DE', region: 'Bavaria' }]
			}
		});
		await page.getByRole('textbox', { name: 'City', exact: true }).fill('München');
		await expect.element(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
		const choice = page.getByRole('link', { name: 'Munich Bavaria, Germany' });
		await expect.element(choice).toHaveAttribute('data-sveltekit-preload-data', 'off');
		await expect
			.element(choice)
			.toHaveAttribute('href', '/cities?city=Munich&country=DE&region=Bavaria');
	});
	it('explains an exhausted nearby search and lets the user clear their preference', async () => {
		await render(CitiesPage, { data: { ...local, shown: null, noLocalEvents: true } });
		await expect
			.element(page.getByText('No nearby results found. Try another city.'))
			.toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Change city' })).toBeVisible();
		const reset = page.getByRole('link', { name: 'Use approximate IP location' });
		await expect.element(reset).toHaveAttribute('data-sveltekit-preload-data', 'off');
		await expect.element(reset).toHaveAttribute('href', '/cities?locate=1');
	});
	it('keeps load-more usable when a sparse snapshot page has no live events yet', async () => {
		await render(CitiesPage, { data: { ...local, cursor: 'remaining-city-events' } });
		await expect
			.element(
				page.getByText(
					'Some listings are no longer available. Load more to check the remaining events.'
				)
			)
			.toBeVisible();
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
