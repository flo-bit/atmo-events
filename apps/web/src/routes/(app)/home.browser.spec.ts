import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../app.css';

const mocks = vi.hoisted(() => ({
	user: { isLoggedIn: true, profile: null, did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' }
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user: mocks.user }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
vi.mock('#lib/components/CreateEventModal.svelte', () => ({
	createEventModalState: { show: vi.fn() }
}));
import Home from './+page.svelte';

const heading = 'Events you might be interested in';
const events = ['First recommended gathering', 'Second recommended gathering'].map((name, i) => ({
	uri: `at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/test-${i}`,
	did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
	rkey: `test-${i}`,
	name,
	startsAt: '2099-01-01T12:00:00Z',
	createdAt: '2026-11-01T12:00:00Z'
}));
const data = (recommendedEvents: Promise<unknown[]>) => ({
	events: [],
	handles: {},
	myUpcoming: [],
	myPast: [],
	recentActivity: [],
	recentActivityIsPersonalized: false,
	recommendedEvents
});
beforeEach(() => {
	mocks.user.isLoggedIn = true;
});

describe('homepage recommendations', () => {
	it('renders at least two events with existing cards and a new-tab attribution link', async () => {
		await render(Home, { data: data(Promise.resolve(events)) } as never);
		await expect.element(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
		for (const event of events) {
			await expect.element(page.getByText(event.name, { exact: true })).toBeVisible();
		}
		const attribution = page.getByRole('link', { name: 'Powered by For You' });
		await expect.element(attribution).toHaveAttribute('href', 'https://foryou.club/atmosphere');
		await expect.element(attribution).toHaveAttribute('target', '_blank');
		await expect.element(attribution).toHaveAttribute('rel', 'noopener noreferrer');
	});
	it.each([0, 1])('omits the entire section when only %i events are available', async (count) => {
		await render(Home, { data: data(Promise.resolve(events.slice(0, count))) } as never);
		await expect
			.element(page.getByRole('heading', { name: 'Upcoming Popular Events' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: heading, exact: true }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('Powered by For You')).not.toBeInTheDocument();
	});
	it('does not add loading chrome or block the rest of the homepage', async () => {
		let resolve!: (events: unknown[]) => void;
		const pending = new Promise<unknown[]>((r) => {
			resolve = r;
		});
		await render(Home, { data: data(pending) } as never);
		await expect
			.element(page.getByRole('heading', { name: 'Upcoming Popular Events' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: heading, exact: true }))
			.not.toBeInTheDocument();
		resolve(events);
		await expect.element(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
	});
	it('never shows another viewer’s result after signing out', async () => {
		mocks.user.isLoggedIn = false;
		await render(Home, { data: data(Promise.resolve(events)) } as never);
		await expect
			.element(page.getByRole('heading', { name: 'Upcoming Popular Events' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: heading, exact: true }))
			.not.toBeInTheDocument();
	});
});
