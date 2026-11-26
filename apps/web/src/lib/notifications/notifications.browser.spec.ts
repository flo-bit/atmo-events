import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import '../../app.css';

const mocks = vi.hoisted(() => ({
	user: { isLoggedIn: true, did: 'did:plc:alice', profile: null },
	inbox: vi.fn(),
	read: vi.fn(),
	preferences: vi.fn(),
	save: vi.fn(),
	sync: vi.fn(),
	enable: vi.fn(),
	disable: vi.fn()
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ ...mocks, login: vi.fn(), signup: vi.fn() }));
vi.mock('./client.svelte.js', async (importOriginal) => ({
	...(await importOriginal()),
	notifications: {
		inbox: mocks.inbox,
		markRead: mocks.read,
		preferences: mocks.preferences,
		setPreference: mocks.save
	},
	syncPush: mocks.sync,
	setDevicePush: (enabled: boolean) => (enabled ? mocks.enable() : mocks.disable())
}));
import NotificationsPage from '../../routes/(app)/notifications/+page.svelte';
import Preferences from './Preferences.svelte';

const now = Date.parse('2026-11-11T12:00:00Z');
const items = [
	{
		id: '1',
		title: 'Evening walk changed',
		body: 'Check the latest event details.',
		uri: '#walk',
		sendAt: now - 60_000,
		readAt: null
	},
	{
		id: '2',
		title: 'Open studio starts soon',
		uri: '#studio',
		sendAt: now - 10 * 60_000,
		readAt: now
	}
];
const preferences = [
	{
		category: 'reminder',
		title: 'Event reminders',
		enabled: true,
		channels: ['push'],
		isDefault: true
	},
	{
		category: 'change',
		title: 'Event changes',
		enabled: true,
		channels: ['push'],
		isDefault: true
	},
	{
		category: 'rsvp',
		title: 'New RSVPs',
		description: 'For events you host',
		enabled: true,
		channels: []
	}
];
function data(inbox: unknown) {
	return { inbox, now } as ComponentProps<typeof NotificationsPage>['data'];
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.user.isLoggedIn = true;
	mocks.read.mockResolvedValue({ unread: 0 });
	mocks.preferences.mockResolvedValue({ preferences, channels: ['push'] });
	mocks.sync.mockResolvedValue('off');
	mocks.enable.mockResolvedValue('on');
	mocks.disable.mockResolvedValue('off');
	document.body.classList.add('atmo', 'zinc', 'pink');
});

it('renders the signed-in inbox, marks it read, and loads the next page', async () => {
	mocks.inbox.mockResolvedValue({
		items: [{ ...items[0], id: '3', title: 'Mira is going' }],
		cursor: null,
		unread: 1
	});
	await render(NotificationsPage, {
		data: data({ items, cursor: 'next', unread: 1 }),
		params: {},
		form: null
	});
	await expect.element(page.getByRole('link', { name: /Evening walk changed/ })).toBeVisible();
	await page.getByRole('button', { name: 'Mark all read' }).click();
	expect(mocks.read).toHaveBeenCalledWith(undefined);
	await page.getByRole('button', { name: 'Show more' }).click();
	await expect.element(page.getByText('Mira is going')).toBeVisible();
	expect(mocks.inbox).toHaveBeenCalledWith({ cursor: 'next' });
	await page.screenshot({ path: './.vitest/notifications-inbox.png' });
});
it('replaces the inbox on navigation and ignores an older page request', async () => {
	const loading = Promise.withResolvers<unknown>();
	mocks.inbox.mockReturnValue(loading.promise);
	const { rerender } = await render(NotificationsPage, {
		data: data({ items, cursor: 'next', unread: 1 }),
		params: {},
		form: null
	});
	await expect.element(page.getByText(items[0].title)).toBeVisible();
	await page.getByRole('button', { name: 'Show more' }).click();
	await rerender({ data: data({ items: [], cursor: null, unread: 0 }) });
	loading.resolve({ items, cursor: 'stale', unread: 1 });
	await expect.element(page.getByText('No notifications yet.')).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
});
it('renders empty and signed-out states', async () => {
	const { unmount } = await render(NotificationsPage, {
		data: data({ items: [], cursor: null, unread: 0 }),
		params: {},
		form: null
	});
	await expect.element(page.getByText('No notifications yet.')).toBeVisible();
	await unmount();
	mocks.user.isLoggedIn = false;
	await render(NotificationsPage, { data: data(null), params: {}, form: null });
	await expect.element(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
});
it('keeps paging failures retryable', async () => {
	mocks.inbox.mockRejectedValue(new Error('Unavailable'));
	await render(NotificationsPage, {
		data: data({ items, cursor: 'next', unread: 1 }),
		params: {},
		form: null
	});
	await page.getByRole('button', { name: 'Show more' }).click();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Could not load notifications. Try again.');
	await expect.element(page.getByRole('button', { name: 'Show more' })).toBeEnabled();
});
it('saves category choices and enables/disables this device through Kit controls', async () => {
	mocks.save
		.mockResolvedValueOnce({
			preferences: preferences.map((p) =>
				p.category === 'change' ? { ...p, enabled: false, channels: [], isDefault: false } : p
			)
		})
		.mockResolvedValueOnce({ preferences });
	await render(Preferences);
	await expect.element(page.getByRole('checkbox', { name: 'Event changes: In app' })).toBeChecked();
	await page.getByRole('checkbox', { name: 'Event changes: In app' }).click();
	expect(mocks.save).toHaveBeenCalledWith('change', 'off');
	await expect.element(page.getByRole('checkbox', { name: 'Event changes: Push' })).toBeDisabled();
	await page.getByRole('button', { name: 'Event changes: Use default' }).click();
	expect(mocks.save).toHaveBeenLastCalledWith('change', null);
	await expect.element(page.getByRole('checkbox', { name: 'Event changes: Push' })).toBeChecked();
	await page.getByRole('button', { name: 'Turn on push on this device' }).click();
	await page.getByRole('button', { name: 'Turn off push on this device' }).click();
	expect(mocks.enable).toHaveBeenCalledOnce();
	expect(mocks.disable).toHaveBeenCalledOnce();
	await page.screenshot({ path: './.vitest/notifications-settings.png' });
});
it('keeps the saved checkboxes checked after a failed preference save', async () => {
	mocks.save.mockRejectedValue(new Error('Unavailable'));
	await render(Preferences);
	const inApp = page.getByRole('checkbox', { name: 'Event changes: In app' });
	const push = page.getByRole('checkbox', { name: 'Event changes: Push' });
	await inApp.click();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Could not save notification settings. Try again.');
	await expect.element(inApp).toBeChecked();
	await expect.element(push).toBeChecked();
	await push.click();
	await expect.element(push).toBeChecked();
	expect(mocks.save).toHaveBeenLastCalledWith('change', []);
});

it('keeps category settings usable when push setup fails, and retries push separately', async () => {
	mocks.sync.mockRejectedValueOnce(new Error('ServiceWorker script evaluation failed'));
	await render(Preferences);
	await expect
		.element(page.getByRole('checkbox', { name: 'Event reminders: In app' }))
		.toBeVisible();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Could not set up push on this device.');
	await page.getByRole('button', { name: 'Retry push setup' }).click();
	await expect
		.element(page.getByRole('button', { name: 'Turn on push on this device' }))
		.toBeVisible();
});

it('shows a load failure and retries without pretending settings were loaded', async () => {
	mocks.preferences.mockRejectedValueOnce(new Error('Unavailable'));
	await render(Preferences);
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Could not load notification settings.');
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect
		.element(page.getByRole('checkbox', { name: 'Event reminders: In app' }))
		.toBeVisible();
});
