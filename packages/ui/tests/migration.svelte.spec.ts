import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventEditor from '../src/EventEditor.svelte';
import EventView from '../src/EventView.svelte';
import EventCard from '../src/EventCard.svelte';
import RecurringModal from '../src/editor/RecurringModal.svelte';
import PostToBlueskyModal from '../src/PostToBlueskyModal.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

describe('Atmo Kit migration', () => {
	it('edits existing events inline, opens themed popovers/dialogs, and saves without losing fields', async () => {
		const adapter = createAdapter();
		render(EventEditor, {
			eventData: event,
			actorDid: event.did,
			rkey: event.rkey,
			adapter,
			viewer
		});
		const title = page.getByRole('textbox', { name: 'Event name', exact: true });
		await expect.element(title).toHaveTextContent(event.name);
		await title.click();
		expect(
			getComputedStyle(title.element().closest('[data-slot="inline-editor"]')!).outlineStyle
		).toBe('none');
		await title.fill('A different gathering');
		await page.getByRole('button', { name: 'Add link', exact: true }).click();
		await page.getByRole('textbox', { name: 'Link URL', exact: true }).fill('https://example.com');
		await page.getByRole('textbox', { name: 'Link label', exact: true }).fill('Details');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect.element(page.getByText('Details', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Minimal', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Event theme' })).toBeVisible();
		await page.getByRole('button', { name: 'Close dialog' }).click();
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect.poll(() => adapter.putRecord).toHaveBeenCalled();
		expect(adapter.putRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				record: expect.objectContaining({
					name: 'A different gathering',
					theme: event.theme,
					uris: [{ uri: 'https://example.com', name: 'Details' }]
				})
			})
		);
	});

	it('preserves RSVP and cancellation actions and updates the attendee preview', async () => {
		const adapter = createAdapter();
		render(EventView, {
			data: {
				eventData: event,
				actorDid: event.did,
				rkey: event.rkey,
				hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
				attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
			},
			adapter,
			viewer,
			pageUrl: new URL('https://atmo.rsvp/p/host.example.com/e/test-event')
		});
		await page.getByRole('button', { name: 'Interested', exact: true }).click();
		await expect.element(page.getByText("You're Interested", { exact: true })).toBeVisible();
		expect(adapter.putRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'community.lexicon.calendar.rsvp',
				record: expect.objectContaining({ status: 'community.lexicon.calendar.rsvp#interested' })
			})
		);
		await page.getByRole('button', { name: /1 Interested/ }).click();
		await expect
			.element(page.getByRole('dialog', { name: 'Interested (1)', exact: true }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Close dialog' }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Going', exact: true })).toBeVisible();
		expect(adapter.deleteRecord).toHaveBeenCalled();
	});

	it('shares a post with detected facets, and keeps host comment settings on the event', async () => {
		const adapter = createAdapter();
		render(PostToBlueskyModal, {
			open: true,
			eventDid: event.did,
			eventRkey: event.rkey,
			eventName: event.name,
			eventUrl: 'https://atmo.rsvp/test',
			initialText: 'Join @host.example.com for #smallweb https://example.com',
			canSetEventComments: true,
			adapter,
			viewer
		});
		await expect
			.element(page.getByRole('combobox', { name: 'Post text' }))
			.toHaveTextContent('Join @host.example.com');
		await page.getByRole('button', { name: 'Post', exact: true }).click();
		await expect.poll(() => adapter.createRecord).toHaveBeenCalled();
		expect(adapter.createRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				record: expect.objectContaining({
					text: 'Join @host.example.com for #smallweb https://example.com',
					facets: expect.arrayContaining([
						expect.objectContaining({
							features: [{ $type: 'app.bsky.richtext.facet#mention', did: viewer.did }]
						}),
						expect.objectContaining({
							features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'smallweb' }]
						})
					])
				})
			})
		);
		await expect.poll(() => adapter.putRecord).toHaveBeenCalled();
		expect(adapter.putRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				record: expect.objectContaining({
					bskyPostRef: expect.objectContaining({ showComments: true })
				})
			})
		);
	});

	it('keeps the editor usable on narrow screens, including the timezone picker', async () => {
		await page.viewport(320, 900);
		try {
			render(EventEditor, {
				eventData: event,
				actorDid: event.did,
				rkey: event.rkey,
				adapter: createAdapter(),
				viewer
			});
			await expect
				.element(page.getByRole('textbox', { name: 'Event name', exact: true }))
				.toHaveTextContent(event.name);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
			const date = page.getByRole('button', { name: /^Start date:/ });
			await expect.element(date).toBeVisible();
			expect(getComputedStyle(date.element()).boxShadow).toContain('inset');
			const zone = page.getByRole('button', { name: /^Timezone:/ });
			expect(getComputedStyle(zone.element()).boxShadow).toContain('inset');
			expect(zone.element().getBoundingClientRect().height).toBe(
				date.element().getBoundingClientRect().height
			);
			await zone.click();
			await page.getByRole('searchbox', { name: 'Search timezone', exact: true }).fill('Tokyo');
			await page.getByRole('button', { name: /Tokyo/ }).click();
			await expect
				.element(page.getByRole('button', { name: 'Timezone: Asia/Tokyo', exact: true }))
				.toBeVisible();
		} finally {
			await page.viewport(1280, 1000);
		}
	});

	it('validates recurring controls and preserves wall-clock times across daylight saving changes', async () => {
		const adapter = createAdapter();
		render(RecurringModal, {
			open: true,
			rkey: event.rkey,
			eventData: event,
			isNew: false,
			name: 'Meetup #7',
			startsAt: '2030-03-24T10:00:00',
			endsAt: '2030-03-24T11:00:00',
			mode: 'inperson',
			timezone: 'Europe/Berlin',
			description: '',
			links: [],
			location: null,
			thumbnailDateStr: '',
			thumbnailFile: null,
			thumbnailChanged: false,
			selectedPreset: null,
			accent: 'pink',
			adapter,
			viewer
		});
		const count = page.getByRole('spinbutton', { name: 'Number of events to create' });
		await count.fill('');
		await expect.element(page.getByRole('button', { name: /^Create / })).toBeDisabled();
		await count.fill('53');
		await expect.element(page.getByRole('button', { name: /^Create / })).toBeDisabled();
		await count.fill('2');
		await page.getByRole('button', { name: 'Create 2 events', exact: true }).click();
		await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(2);
		expect(adapter.putRecord.mock.calls.map(([args]) => args.record)).toEqual([
			expect.objectContaining({
				name: 'Meetup #8',
				startsAt: '2030-03-31T08:00:00.000Z',
				endsAt: '2030-03-31T09:00:00.000Z'
			}),
			expect.objectContaining({
				name: 'Meetup #9',
				startsAt: '2030-04-07T08:00:00.000Z',
				endsAt: '2030-04-07T09:00:00.000Z'
			})
		]);
	});

	it('keeps compact event links and private-event routing', async () => {
		render(EventCard, {
			event: { ...event, space: 'at://did:plc:host/space/secret' },
			actor: 'host.example.com'
		});
		await expect
			.element(page.getByRole('link', { name: /Small web, big ideas/ }))
			.toHaveAttribute('href', '/p/host.example.com/e/test-event/s/secret');
	});
});
