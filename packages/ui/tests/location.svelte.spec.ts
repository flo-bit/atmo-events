import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventEditor from '../src/EventEditor.svelte';
import RecurringModal from '../src/editor/RecurringModal.svelte';
import { buildEventRecord } from '../src/editor/save.js';
import {
	LocationValidationError,
	normalizeCountryCode,
	normalizeEventLocations
} from '../src/editor/location.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

afterEach(() => vi.unstubAllGlobals());

const addressType = 'community.lexicon.location.address' as const;
const saveArgs: Parameters<typeof buildEventRecord>[0] = {
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
};

describe('country codes on published addresses (#80)', () => {
	it.each([
		['United States', 'US'],
		[' united states of america ', 'US'],
		['us', 'US'],
		['USA', 'US'],
		['United Kingdom', 'GB'],
		['UK', 'GB'],
		['Germany', 'DE'],
		['Austria', 'AT'],
		['Côte d’Ivoire', 'CI']
	])('normalizes %s to %s', (input, expected) => {
		expect(normalizeCountryCode(input)).toBe(expected);
	});

	it.each([undefined, null, '', 'Atlantis', 'ZZ', 'not a country', 123])(
		'rejects unresolvable countries: %s',
		(input) => {
			expect(normalizeCountryCode(input)).toBeUndefined();
		}
	);

	it('normalizes imported names on creation and after changing a location', async () => {
		for (const isNew of [true, false]) {
			const record = await buildEventRecord({
				...saveArgs,
				isNew,
				eventData: isNew ? null : event,
				locationChanged: true,
				location: { street: 'Ward Road 5460', locality: 'Arvada', country: 'United States' }
			});
			expect(record.locations).toEqual([
				{ $type: addressType, street: 'Ward Road 5460', locality: 'Arvada', country: 'US' }
			]);
		}
	});

	it('repairs unchanged legacy addresses without losing metadata or other location variants', async () => {
		const locations = [
			{ $type: addressType, country: 'United States', name: 'Venue', postalCode: '80002' },
			{ $type: addressType, country: 'UK', locality: 'London' },
			{ $type: 'community.lexicon.location.geo' as const, latitude: '39.8', longitude: '-105.1' }
		];
		const original = structuredClone(locations);
		const record = await buildEventRecord({
			...saveArgs,
			isNew: false,
			eventData: { ...event, locations }
		});
		expect(record.locations).toEqual([
			{ ...locations[0], country: 'US' },
			{ ...locations[1], country: 'GB' },
			locations[2]
		]);
		expect(locations).toEqual(original);
	});

	it('blocks addresses with missing or unknown countries rather than publishing invalid records', async () => {
		for (const country of [undefined, 'Atlantis']) {
			await expect(
				buildEventRecord({ ...saveArgs, location: { locality: 'Somewhere', country } })
			).rejects.toBeInstanceOf(LocationValidationError);
		}
		expect(() => normalizeEventLocations([{ $type: addressType, country: 'ZZ' }])).toThrow(
			LocationValidationError
		);
	});

	it('lets the editor remove an unresolvable legacy address instead of republishing it', async () => {
		const adapter = createAdapter();
		render(EventEditor, {
			eventData: { ...event, locations: [{ $type: addressType, country: 'Atlantis' }] },
			actorDid: event.did,
			rkey: event.rkey,
			adapter,
			viewer
		});
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect.element(page.getByText(/Choose a location with a valid country/)).toBeVisible();
		expect(adapter.putRecord).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Remove location', exact: true }).click();
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect.poll(() => adapter.putRecord).toHaveBeenCalled();
		expect(adapter.putRecord.mock.calls[0][0].record.locations).toBeUndefined();
	});

	it('allows events without an address', async () => {
		const record = await buildEventRecord(saveArgs);
		expect(record.locations).toBeUndefined();
	});

	it('uses the geocoder country_code even when the display name is localized', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						label: 'Arvada, Colorado, États-Unis',
						address: {
							road: 'Ward Road',
							house_number: '5460',
							city: 'Arvada',
							state: 'Colorado',
							country: 'États-Unis',
							country_code: 'us'
						}
					}),
					{ headers: { 'content-type': 'application/json' } }
				)
		);
		vi.stubGlobal('fetch', fetchMock);
		const adapter = createAdapter();
		render(EventEditor, {
			eventData: event,
			actorDid: event.did,
			rkey: event.rkey,
			adapter,
			viewer
		});
		await page.getByRole('button', { name: 'Add location', exact: true }).click();
		await page.getByRole('textbox', { name: 'Search location' }).fill('Ward Road 5460');
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await page.getByRole('button', { name: 'Use this location', exact: true }).click();
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect
			.poll(() => adapter.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					record: expect.objectContaining({
						locations: [
							{
								$type: addressType,
								street: 'Ward Road 5460',
								locality: 'Arvada',
								region: 'Colorado',
								country: 'US'
							}
						]
					})
				})
			);
		expect(fetchMock).toHaveBeenCalledWith('/api/geocoding?q=Ward%20Road%205460');
	});

	it.each(['United States', 'Atlantis'])(
		'validates recurring event countries: %s',
		async (country) => {
			const adapter = createAdapter();
			render(RecurringModal, {
				open: true,
				rkey: event.rkey,
				eventData: event,
				isNew: false,
				name: event.name,
				startsAt: saveArgs.startsAt,
				endsAt: saveArgs.endsAt,
				mode: 'inperson',
				timezone: 'UTC',
				description: '',
				links: [],
				location: { locality: 'Arvada', country },
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
			if (country === 'Atlantis') {
				await expect
					.element(page.getByText(/Choose a location with a valid country/))
					.toBeVisible();
				expect(adapter.putRecord).not.toHaveBeenCalled();
			} else {
				await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(2);
				for (const [args] of adapter.putRecord.mock.calls) {
					expect(args.record.locations).toEqual([
						{ $type: addressType, locality: 'Arvada', country: 'US' }
					]);
				}
			}
		}
	);
});
