import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventCard from '../src/EventCard.svelte';
import EventEditor from '../src/EventEditor.svelte';
import { getEventThumbnail } from '../src/event-media.js';
import { buildEventRecord, buildThumbnailMedia } from '../src/editor/save.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const flyer = {
	role: 'flyer',
	alt: 'Event flyer',
	content: { $type: 'blob' as const, ref: { $link: 'test-flyer' } }
};
const thumbnail = { ...flyer, role: 'thumbnail', alt: 'Event thumbnail' };
const header = { ...flyer, role: 'header', alt: 'Event header' };

it('prefers thumbnails over flyers regardless of media order', () => {
	expect(getEventThumbnail([flyer, header, thumbnail])).toBe(thumbnail);
	expect(getEventThumbnail([thumbnail, flyer])).toBe(thumbnail);
	expect(getEventThumbnail([header, flyer])).toBe(flyer);
	expect(getEventThumbnail([header])).toBeUndefined();
	expect(getEventThumbnail(undefined)).toBeUndefined();
	expect(getEventThumbnail([])).toBeUndefined();
});

it('uses the thumbnail on cards when a flyer comes first', async () => {
	render(EventCard, { event: { ...event, media: [flyer, thumbnail] } });
	await expect
		.element(page.getByRole('img', { name: 'Event thumbnail', exact: true }))
		.toBeVisible();
	await expect
		.element(page.getByRole('img', { name: 'Event flyer', exact: true }))
		.not.toBeInTheDocument();
});

it('shows existing flyers in the thumbnail editor', async () => {
	render(EventEditor, {
		eventData: { ...event, media: [header, flyer] },
		actorDid: event.did,
		rkey: event.rkey,
		adapter: createAdapter(),
		viewer
	});
	const preview = page.getByRole('img', { name: 'Thumbnail preview', exact: true });
	await expect.element(preview).toBeVisible();
	await expect.element(preview).toHaveAttribute('src', expect.stringContaining('/test-flyer@webp'));
});

it('preserves unchanged flyers without uploading', async () => {
	const uploadBlob = vi.fn();
	const existingMedia = [header, flyer];
	expect(
		await buildThumbnailMedia({
			isNew: false,
			thumbnailChanged: false,
			thumbnailFile: null,
			existingMedia,
			uploadBlob
		})
	).toBe(existingMedia);
	expect(uploadBlob).not.toHaveBeenCalled();
});

it.each(['thumbnail', 'flyer'])('preserves the %s role when replacing its image', async (role) => {
	const image = new File(
		[
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" /></svg>'
		],
		'cover.svg',
		{ type: 'image/svg+xml' }
	);
	const blobRef = { $type: 'blob', ref: { $link: 'replacement' } };
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: image,
		existingMedia: [header, { ...flyer, role }],
		uploadBlob: async () => blobRef
	});
	expect(media).toEqual([
		header,
		{
			role,
			content: blobRef,
			aspect_ratio: { width: 10, height: 20 }
		}
	]);
});

it('removes a flyer without removing unrelated media', async () => {
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: null,
		existingMedia: [flyer, header],
		uploadBlob: vi.fn()
	});
	expect(media).toEqual([header]);
});

it('does not restore a removed last image when building the record', async () => {
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: null,
		existingMedia: [flyer],
		uploadBlob: vi.fn()
	});
	const record = await buildEventRecord({
		eventData: { ...event, media: [flyer] },
		isNew: false,
		name: event.name,
		description: '',
		startsAt: '2099-10-24T18:30',
		endsAt: '',
		timezone: 'UTC',
		mode: 'inperson',
		visibility: 'public',
		theme: event.theme!,
		links: [],
		location: null,
		locationChanged: false,
		media,
		resolveHandle: async () => viewer.did!
	});
	expect(record).not.toHaveProperty('media');
});
