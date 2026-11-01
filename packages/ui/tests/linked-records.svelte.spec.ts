import { afterEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LinkedRecordsFixture from './LinkedRecordsFixture.svelte';
import EventView from '../src/EventView.svelte';
import type { GrainGallery } from '../src/linked-records.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const did = viewer.did!;
const tinyImage =
	'data:image/svg+xml,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#b5a6c7"/><path d="M0 400 230 160 460 400 640 210V480H0Z" fill="#78628e"/><circle cx="470" cy="110" r="45" fill="#e1d9ea"/></svg>'
	);
const album: GrainGallery = {
	uri: `at://${did}/social.grain.gallery/album`,
	url: `https://grain.social/profile/${did}/gallery/album`,
	title: 'Berlin meetup',
	creator: { did, handle: 'alice.example', displayName: 'Alice' },
	cover: tinyImage,
	photoCount: 2,
	contentWarning: false,
	photos: [1, 2].map((n) => ({
		uri: `at://${did}/social.grain.photo/${n}`,
		thumb: tinyImage,
		fullsize: tinyImage,
		alt: `Meetup photo ${n}`,
		contentWarning: false
	}))
};
function adapter() {
	return {
		...createAdapter(),
		linkedRecords: {
			getGrainGallery: vi.fn(async () => album),
			listGrainAlbums: vi.fn(async () => ({
				albums: [album],
				cursor: 'next' as string | undefined
			}))
		}
	};
}
async function openPicker(kind = 'Grain.social album') {
	await page.getByRole('button', { name: 'Add linked record', exact: true }).click();
	await page.getByRole('button', { name: kind, exact: true }).click();
}
function eventProps(a = adapter(), overrides: Record<string, unknown> = {}) {
	return {
		data: {
			eventData: { ...event, uris: [{ uri: album.url, name: album.title }], ...overrides },
			actorDid: did,
			rkey: event.rkey,
			hostProfile: { did, handle: viewer.handle },
			attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
		},
		adapter: a,
		viewer,
		pageUrl: new URL('https://atmo.rsvp/p/host.example/e/event')
	};
}

describe('linked record picker', () => {
	it('loads albums only on opening, supports pagination and selecting a stable link', async () => {
		const a = adapter();
		a.linkedRecords.listGrainAlbums
			.mockResolvedValueOnce({ albums: [album], cursor: 'next' })
			.mockResolvedValueOnce({
				albums: [{ ...album, uri: album.uri + '2', url: album.url + '2', title: 'Second album' }],
				cursor: undefined
			});
		await render(LinkedRecordsFixture, { adapter: a, viewer });
		expect(a.linkedRecords.listGrainAlbums).not.toHaveBeenCalled();
		await openPicker();
		await expect
			.element(page.getByRole('button', { name: 'Add Berlin meetup', exact: true }))
			.toBeVisible();
		expect(a.linkedRecords.listGrainAlbums).toHaveBeenCalledWith(did, undefined);
		await page.getByRole('button', { name: 'Load more', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Add Second album' })).toBeVisible();
		expect(a.linkedRecords.listGrainAlbums).toHaveBeenLastCalledWith(did, 'next');
		await page.getByRole('button', { name: 'Add Berlin meetup', exact: true }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByLabelText('Event links')).toMatchTextContent(album.url);
		await expect.element(page.getByLabelText('Form submits')).toHaveTextContent('0');
		await openPicker();
		await expect.element(page.getByRole('button', { name: 'Added Berlin meetup' })).toBeDisabled();
	});
	it('previews another person’s album from a pasted link, even after own-album loading fails', async () => {
		const a = adapter();
		a.linkedRecords.listGrainAlbums.mockRejectedValue(new Error('offline'));
		await render(LinkedRecordsFixture, { adapter: a, viewer });
		await openPicker();
		await expect
			.element(page.getByText('Couldn’t load your albums. You can still paste a link.'))
			.toBeVisible();
		await page
			.getByRole('textbox', { name: 'Grain album link' })
			.fill('https://grain.social/profile/alice.example/gallery/album');
		await page.getByRole('button', { name: 'Preview', exact: true }).click();
		await expect.element(page.getByText('@alice.example · 2 photos')).toBeVisible();
		await page.getByRole('button', { name: 'Add album', exact: true }).click();
		await expect.element(page.getByLabelText('Event links')).toMatchTextContent(album.url);
	});
	it('recognizes legacy links and removes the final linked record', async () => {
		await render(LinkedRecordsFixture, {
			adapter: adapter(),
			viewer,
			initialLinks: [{ uri: album.url, name: album.title }]
		});
		await expect.element(page.getByText('Linked records', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Remove Berlin meetup' }).click();
		await expect.element(page.getByLabelText('Event links')).toHaveTextContent('[]');
	});
	it('adds my stream and explicitly replaces it with another person’s stream', async () => {
		const a = adapter();
		await render(LinkedRecordsFixture, { adapter: a, viewer });
		await openPicker('Streamplace stream');
		await page.getByRole('button', { name: 'Add my Streamplace link', exact: true }).click();
		await expect
			.element(page.getByLabelText('Event links'))
			.toMatchTextContent(`https://stream.place/${viewer.handle}`);
		await openPicker('Streamplace stream');
		await page.getByRole('textbox', { name: /another person/ }).fill('@other.example');
		await page.getByRole('button', { name: 'Replace stream', exact: true }).click();
		await expect
			.element(page.getByLabelText('Event links'))
			.toMatchTextContent('https://stream.place/other.example');
		await expect
			.element(page.getByLabelText('Event links'))
			.not.toMatchTextContent(`https://stream.place/${viewer.handle}`);
		expect(a.resolveHandle).toHaveBeenLastCalledWith('other.example');
	});
	it('keeps generic event links working', async () => {
		await render(LinkedRecordsFixture, { adapter: adapter(), viewer });
		await page.getByRole('button', { name: 'Add link', exact: true }).click();
		await page.getByRole('textbox', { name: 'Link URL', exact: true }).fill('https://example.org/');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect
			.element(page.getByLabelText('Event links'))
			.toMatchTextContent('https://example.org/');
	});
});

describe('event photos', () => {
	it('loads on the first Photos visit, retains the gallery between tabs and opens a keyboard lightbox', async () => {
		const a = adapter();
		await render(EventView, eventProps(a));
		expect(a.linkedRecords.getGrainGallery).not.toHaveBeenCalled();
		await page.getByRole('radio', { name: 'Photos', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: 'View photo 1 of 2: Meetup photo 1', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Open on Grain' }))
			.toHaveAttribute('href', album.url);
		await page.getByRole('radio', { name: 'About', exact: true }).click();
		await page.getByRole('radio', { name: 'Photos', exact: true }).click();
		expect(a.linkedRecords.getGrainGallery).toHaveBeenCalledTimes(1);
		await page
			.getByRole('button', { name: 'View photo 1 of 2: Meetup photo 1', exact: true })
			.click();
		await expect.element(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('button', { name: 'Next photo' }).click();
		await expect.element(page.getByRole('dialog')).toMatchTextContent('Berlin meetup · 2 / 2');
		await page.getByRole('button', { name: 'Previous photo' }).click();
		await expect.element(page.getByRole('dialog')).toMatchTextContent('Berlin meetup · 1 / 2');
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(page.getByRole('dialog')).toMatchTextContent('Berlin meetup · 2 / 2');
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
	it('falls back to Photos when no description or comments exist, without a redundant switcher', async () => {
		await render(EventView, eventProps(adapter(), { description: '' }));
		await expect.element(page.getByRole('button', { name: /View photo 1/ })).toBeVisible();
		await expect
			.element(page.getByRole('radiogroup', { name: 'Event content' }))
			.not.toBeInTheDocument();
	});
	it('keeps a working album link on failure and allows retry', async () => {
		const a = adapter();
		a.linkedRecords.getGrainGallery.mockRejectedValueOnce(new Error('offline'));
		await render(EventView, eventProps(a));
		await page.getByRole('radio', { name: 'Photos', exact: true }).click();
		await expect
			.element(page.getByText('Photos are unavailable. You can still open the album on Grain.'))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Open on Grain' }))
			.toHaveAttribute('href', album.url);
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect.element(page.getByRole('button', { name: /View photo 1/ })).toBeVisible();
	});
	it('does not mount warned album images until explicitly revealed', async () => {
		const a = adapter();
		a.linkedRecords.getGrainGallery.mockResolvedValue({ ...album, contentWarning: true });
		await render(EventView, eventProps(a));
		await page.getByRole('radio', { name: 'Photos', exact: true }).click();
		await expect.element(page.getByText('This album has a content warning.')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /View photo 1/ }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Show photos', exact: true }).click();
		await expect.element(page.getByRole('button', { name: /View photo 1/ })).toBeVisible();
	});

	it('gates individual warned photos and excludes them from lightbox navigation until revealed', async () => {
		const a = adapter();
		a.linkedRecords.getGrainGallery.mockResolvedValue({
			...album,
			photos: [album.photos[0], { ...album.photos[1], contentWarning: true }]
		});
		await render(EventView, eventProps(a));
		await page.getByRole('radio', { name: 'Photos', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: /Content warning · Show photo 2/ }))
			.toBeVisible();
		await page.getByRole('button', { name: /View photo 1/ }).click();
		await expect.element(page.getByRole('dialog')).toMatchTextContent('1 / 1');
		await expect.element(page.getByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Close dialog' }).click();
		await page.getByRole('button', { name: /Content warning · Show photo 2/ }).click();
		await expect.element(page.getByRole('button', { name: /View photo 2/ })).toBeVisible();
	});
});

describe('linked record accessibility and small screens', () => {
	afterEach(async () => {
		document.documentElement.classList.remove('light', 'dark');
		document.documentElement.style.removeProperty('color-scheme');
		await page.viewport(1280, 1000);
	});
	async function audit() {
		await document.fonts.ready;
		const result = await axe.run(document.body, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
		});
		expect(
			result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) }))
		).toEqual([]);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
		if (import.meta.env.VITE_REVIEW_SCREENSHOTS) await page.screenshot();
	}
	for (const mode of ['light', 'dark']) {
		for (const width of [320, 1280]) {
			it(`album picker: ${mode}, ${width}px`, async () => {
				document.documentElement.classList.add(mode);
				document.documentElement.style.colorScheme = mode;
				await page.viewport(width, 1000);
				await render(LinkedRecordsFixture, { adapter: adapter(), viewer });
				await openPicker();
				await expect
					.element(page.getByRole('button', { name: 'Add Berlin meetup', exact: true }))
					.toBeVisible();
				await audit();
			});
			it(`photo grid and lightbox: ${mode}, ${width}px`, async () => {
				document.documentElement.classList.add(mode);
				document.documentElement.style.colorScheme = mode;
				await page.viewport(width, 1000);
				await render(EventView, eventProps());
				await page.getByRole('radio', { name: 'Photos', exact: true }).click();
				await expect.element(page.getByRole('button', { name: /View photo 1/ })).toBeVisible();
				await audit();
				await page.getByRole('button', { name: /View photo 1/ }).click();
				await expect.element(page.getByRole('dialog')).toBeVisible();
				await audit();
			});
		}
	}
});
