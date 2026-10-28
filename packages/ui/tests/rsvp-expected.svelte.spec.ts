import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventView from '../src/EventView.svelte';
import EventEditor from '../src/EventEditor.svelte';
import EventRsvp from '../src/EventRsvp.svelte';
import RecurringModal from '../src/editor/RecurringModal.svelte';
import ScheduleEventCell from '../src/schedule/ScheduleEventCell.svelte';
import { toScheduleEvents } from '../src/conference.js';
import { buildEventRecord } from '../src/editor/save.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const pageUrl = new URL('https://atmo.rsvp/p/host.example.com/e/test-event');
function viewData(rsvpExpected?: boolean) {
	return {
		eventData: { ...event, rsvpExpected },
		actorDid: event.did,
		rkey: event.rkey,
		hostProfile: { did: event.did, handle: viewer.handle },
		attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
	};
}

describe('rsvpExpected', () => {
	it.each([undefined, true])(
		'keeps existing RSVP behavior when rsvpExpected is %s',
		async (rsvpExpected) => {
			const adapter = createAdapter();
			render(EventView, { data: viewData(rsvpExpected), adapter, viewer, pageUrl });
			await page.getByRole('button', { name: 'Interested', exact: true }).click();
			await expect.element(page.getByText("You're Interested", { exact: true })).toBeVisible();
			expect(adapter.putRecord).toHaveBeenCalled();
		}
	);

	it.each([true, false])('hides RSVP prompts when disabled (logged in: %s)', async (isLoggedIn) => {
		const adapter = createAdapter();
		render(EventView, {
			data: viewData(false),
			adapter,
			viewer: { ...viewer, isLoggedIn },
			pageUrl
		});
		await expect
			.element(page.getByRole('heading', { name: event.name, exact: true }))
			.toBeVisible();
		for (const name of ['Going', 'Interested', 'Log in to RSVP']) {
			await expect.element(page.getByRole('button', { name, exact: true })).not.toBeInTheDocument();
		}
		expect(adapter.putRecord).not.toHaveBeenCalled();
	});

	it('does not prompt for external RSVPs either when the host opts out', async () => {
		const data = viewData(false);
		data.eventData.additionalData = {
			externalSource: { url: 'https://example.com/event', rsvpMode: 'external_only' }
		};
		render(EventView, { data, adapter: createAdapter(), viewer, pageUrl });
		await expect
			.element(page.getByRole('link', { name: 'RSVP on original site' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Going', exact: true }))
			.not.toBeInTheDocument();
	});

	it.each(['going', 'interested', 'notgoing'] as const)(
		'still lets people remove an existing %s RSVP',
		async (status) => {
			const adapter = createAdapter();
			render(EventRsvp, {
				eventUri: event.uri,
				eventCid: null,
				rsvpExpected: false,
				initialRsvpStatus: status,
				initialRsvpRkey: 'existing-rsvp',
				adapter,
				viewer
			});
			await page.getByRole('button', { name: 'Remove', exact: true }).click();
			await expect
				.poll(() => adapter.deleteRecord)
				.toHaveBeenCalledWith({
					collection: 'community.lexicon.calendar.rsvp',
					rkey: 'existing-rsvp'
				});
			await expect
				.element(page.getByRole('button', { name: 'Remove', exact: true }))
				.not.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Going', exact: true }))
				.not.toBeInTheDocument();
			expect(adapter.putRecord).not.toHaveBeenCalled();
		}
	);

	it.each([undefined, false, true])(
		'preserves an existing RSVP setting without writing a default: %s',
		async (rsvpExpected) => {
			const adapter = createAdapter();
			render(EventEditor, {
				eventData: { ...event, rsvpExpected },
				actorDid: event.did,
				rkey: event.rkey,
				adapter,
				viewer
			});
			await expect
				.element(page.getByRole('checkbox', { name: 'Request RSVPs', exact: true }))
				.not.toBeInTheDocument();
			await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
			await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(1);
			const [{ record }] = adapter.putRecord.mock.calls[0];
			expect(record.rsvpExpected).toBe(rsvpExpected);
		}
	);

	it.each([false, true])(
		'does not write the setting on new records or recurring copies: %s',
		async (rsvpExpected) => {
			const record = await buildEventRecord({
				eventData: null,
				isNew: true,
				name: event.name,
				description: '',
				startsAt: '2099-10-24T18:30',
				endsAt: '2099-10-24T21:00',
				timezone: 'UTC',
				mode: 'inperson',
				visibility: 'public',
				theme: event.theme!,
				links: [],
				location: null,
				locationChanged: false,
				media: undefined,
				resolveHandle: async () => viewer.did!
			});
			expect(record).not.toHaveProperty('rsvpExpected');
			const adapter = createAdapter();
			render(RecurringModal, {
				open: true,
				rkey: event.rkey,
				eventData: { ...event, rsvpExpected },
				isNew: false,
				name: event.name,
				startsAt: '2099-10-24T18:30',
				endsAt: '2099-10-24T21:00',
				mode: 'inperson',
				timezone: 'UTC',
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
			await page.getByRole('spinbutton', { name: 'Number of events to create' }).fill('2');
			await page.getByRole('button', { name: 'Create 2 events', exact: true }).click();
			await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(2);
			for (const [args] of adapter.putRecord.mock.calls)
				expect(args.record).not.toHaveProperty('rsvpExpected');
		}
	);

	it('preserves the flag in conference schedules and hides RSVP actions in the talk modal', async () => {
		const [talk] = toScheduleEvents(
			[
				{
					...event,
					rsvpExpected: false,
					additionalData: { type: 'talk', parentEvent: { uri: 'at://conference' } }
				}
			],
			'at://conference'
		);
		expect(talk.rsvpExpected).toBe(false);
		render(ScheduleEventCell, {
			event: {
				...talk,
				startMin: 0,
				endMin: 60,
				startRow: 1,
				spanRows: 12,
				colStart: 1,
				colSpan: 1,
				zIndex: 1
			},
			tz: 'UTC',
			eventActor: viewer.handle!,
			adapter: createAdapter(),
			viewer
		});
		await page.getByRole('button', { name: event.name, exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: event.name })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Going', exact: true }))
			.not.toBeInTheDocument();
	});
});
