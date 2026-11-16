import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { EventEditor, TimezonePicker } from '@atmo-dev/kit/events';
import type { EditorAdapter, EditorViewer, FlatEventRecord } from '@atmo-dev/kit/events-data';

const viewer: EditorViewer = {
	isLoggedIn: true,
	did: 'did:plc:abcdefghijklmnopqrstuvwx',
	handle: 'host.example.com'
};
const event: FlatEventRecord = {
	did: viewer.did!,
	rkey: 'test-event',
	uri: `at://${viewer.did}/community.lexicon.calendar.event/test-event`,
	name: 'Test event',
	createdAt: '2030-06-01T12:00:00Z',
	startsAt: '2030-06-15T10:00:00Z',
	endsAt: '2030-06-15T11:00:00Z',
	timezone: 'UTC'
};
function renderEditor() {
	const adapter = {
		features: { delete: false, recurring: false },
		putRecord: vi.fn(async () => ({ uri: event.uri })),
		createRecord: vi.fn(async () => ({ uri: event.uri, cid: 'test-cid' })),
		deleteRecord: vi.fn(async () => {}),
		uploadBlob: vi.fn(),
		getRecord: vi.fn(),
		resolveHandle: vi.fn(async () => viewer.did!),
		onSaved: vi.fn(),
		requestLogin: vi.fn()
	} satisfies EditorAdapter;
	render(EventEditor, { eventData: event, actorDid: event.did, rkey: event.rkey, adapter, viewer });
	return adapter;
}

it('opens the installed timezone picker when the browser already lists UTC (Safari)', async () => {
	const supported = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Tokyo', 'UTC']);
	try {
		render(TimezonePicker, { value: 'UTC' });
		await page.getByRole('button', { name: 'Timezone: UTC', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Choose timezone' })).toBeVisible();
		expect(page.getByRole('button', { name: /^UTC/ }).elements()).toHaveLength(1);
		await page.getByRole('button', { name: /^Tokyo/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Timezone: Asia/Tokyo', exact: true }))
			.toBeVisible();
	} finally {
		supported.mockRestore();
	}
});

it('lets end-time keystrokes stick, rejects an invalid range, and saves after switching to PM', async () => {
	const adapter = renderEditor();
	const end = page.getByRole('group', { name: 'End time', exact: true });
	await end.getByRole('spinbutton', { name: /^hour/ }).click();
	await userEvent.keyboard('06');
	await expect
		.element(end.getByRole('spinbutton', { name: /^hour/ }))
		.toHaveAttribute('aria-valuenow', '6');
	await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await expect
		.element(page.getByText('End time must be after the start time.', { exact: true }))
		.toBeVisible();
	expect(adapter.putRecord).not.toHaveBeenCalled();
	await end.getByRole('spinbutton', { name: /^AM\/PM/ }).click();
	await userEvent.keyboard('p');
	await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await expect
		.poll(() => adapter.putRecord)
		.toHaveBeenCalledWith(
			expect.objectContaining({
				record: expect.objectContaining({
					startsAt: '2030-06-15T10:00:00.000Z',
					endsAt: '2030-06-15T18:00:00.000Z'
				})
			})
		);
});

it('still advances the end when the start moves past it', async () => {
	const adapter = renderEditor();
	await page.getByRole('button', { name: 'Choose start time', exact: true }).click();
	await page.getByRole('button', { name: '1:30 PM', exact: true }).click();
	await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await expect
		.poll(() => adapter.putRecord)
		.toHaveBeenCalledWith(
			expect.objectContaining({
				record: expect.objectContaining({
					startsAt: '2030-06-15T13:30:00.000Z',
					endsAt: '2030-06-15T14:30:00.000Z'
				})
			})
		);
});
