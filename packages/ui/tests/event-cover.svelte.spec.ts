import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventView from '../src/EventView.svelte';
import EventCard from '../src/EventCard.svelte';
import type { EventData } from '../src/event-types.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const cases = [
	{ name: '3:1 thumbnail', ratio: { width: 1500, height: 500 }, banner: true, frame: 3 },
	{ name: '2:1 thumbnail', ratio: { width: 1000, height: 500 }, banner: true, frame: 2 },
	{ name: 'very wide thumbnail', ratio: { width: 5000, height: 500 }, banner: true, frame: 4 },
	{ name: '3:2 thumbnail', ratio: { width: 900, height: 600 }, banner: false, frame: 1.5 },
	{ name: '16:9 thumbnail', ratio: { width: 1600, height: 900 }, banner: false, frame: 1.5 },
	{ name: 'square thumbnail', ratio: { width: 800, height: 800 }, banner: false, frame: 1 },
	{ name: '3:4 thumbnail', ratio: { width: 600, height: 800 }, banner: false, frame: 0.75 },
	{ name: 'portrait thumbnail', ratio: { width: 600, height: 900 }, banner: false, frame: 0.75 },
	{ name: 'thumbnail without dimensions', ratio: undefined, banner: false, frame: 1 },
	{
		name: 'thumbnail with invalid dimensions',
		ratio: { width: 800, height: 0 },
		banner: false,
		frame: 1
	},
	{ name: 'header without dimensions', ratio: undefined, banner: true, frame: 3, role: 'header' },
	{
		name: 'wide header',
		ratio: { width: 1250, height: 500 },
		banner: true,
		frame: 2.5,
		role: 'header'
	},
	{
		name: 'square header',
		ratio: { width: 800, height: 800 },
		banner: true,
		frame: 2,
		role: 'header'
	}
];

const coverCases = cases.flatMap((cover) =>
	cover.role
		? [cover]
		: [cover, { ...cover, name: cover.name.replace('thumbnail', 'flyer'), role: 'flyer' }]
);

for (const { name, ratio, banner, frame, role = 'thumbnail' } of coverCases) {
	it(`displays ${name} in a ${frame}:1 ${banner ? 'banner' : 'side-column frame'}`, async () => {
		const media: NonNullable<EventData['media']> = [
			{
				role,
				alt: 'Event cover',
				aspect_ratio: ratio,
				content: { $type: 'blob', ref: { $link: 'test-cover' } }
			}
		];
		// A header must not override the selected thumbnail/flyer or its layout.
		if (role !== 'header') {
			media.push({
				role: 'header',
				alt: 'Unused header',
				content: { $type: 'blob', ref: { $link: 'test-header' } }
			});
		}
		render(EventView, {
			data: {
				eventData: { ...event, media },
				actorDid: event.did,
				rkey: event.rkey,
				hostProfile: { did: event.did, handle: viewer.handle },
				attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
			},
			adapter: createAdapter(),
			viewer,
			pageUrl: new URL('https://atmo.rsvp/test')
		});

		const image = page.getByRole('img', { name: 'Event cover', exact: true });
		await expect.element(image).toBeInTheDocument();
		const element = image.element();
		const style = getComputedStyle(element);
		const [width, height = 1] = style.aspectRatio.split('/').map(Number);
		expect(width / height).toBeCloseTo(frame);
		expect(style.objectFit).toBe('cover');
		if (banner) {
			expect(element.getBoundingClientRect().width).toBe(
				element.parentElement!.getBoundingClientRect().width
			);
		}
		await expect.element(page.getByRole('img', { name: 'Unused header' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Edit Event', exact: true })).toBeVisible();
	});
}

it.each(['thumbnail', 'flyer'])('keeps event card %s images square and cropped', async (role) => {
	render(EventCard, {
		event: {
			...event,
			media: [
				{
					role,
					alt: 'Card cover',
					aspect_ratio: { width: 1500, height: 500 },
					content: { $type: 'blob', ref: { $link: 'test-cover' } }
				}
			]
		}
	});
	const image = page.getByRole('img', { name: 'Card cover', exact: true });
	await expect.element(image).toBeInTheDocument();
	const style = getComputedStyle(image.element());
	expect(style.aspectRatio).toBe('1 / 1');
	expect(style.objectFit).toBe('cover');
});
