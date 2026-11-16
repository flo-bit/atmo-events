import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import QrScanner from 'qr-scanner';
import QrCode from './QrCode.svelte';
import { CONNECTION_COLLECTION, type Connection } from './connection';
import {
	navigations,
	navigationOptions,
	submissions,
	submissionSources,
	setNextSave,
	setNextSaveFailure,
	setRefresh
} from './test-app';
import type { PageData } from '../../routes/(app)/tools/meet/$types';
import '../../app.css';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const mocks = vi.hoisted(() => ({
	user: {
		did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' as string | null,
		isLoggedIn: true,
		profile: null as { handle: string } | null
	},
	search: vi.fn(),
	resolve: vi.fn(),
	authorize: vi.fn(),
	login: vi.fn()
}));
vi.mock('@atmo-dev/kit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@atmo-dev/kit')>()),
	createActorSearch: () => mocks.search
}));
vi.mock('../atproto/auth.svelte.js', () => ({
	user: mocks.user,
	authorizeMeetings: mocks.authorize
}));
vi.mock('../components/LoginModal.svelte', () => ({
	atProtoLoginModalState: { show: mocks.login }
}));
vi.mock('./resolve', () => ({ resolveMeetingActor: mocks.resolve }));
vi.mock('./profile', () => ({
	meetingProfile: async (did: string) => ({ did, handle: 'bob.test', displayName: 'Bob' })
}));
import MeetPage from '../../routes/(app)/tools/meet/+page.svelte';
import ToolsPage from '../../routes/(app)/tools/+page.svelte';

const sockets: FakeSocket[] = [];
class FakeSocket {
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	constructor(public url: string) {
		sockets.push(this);
		queueMicrotask(() => this.onopen?.());
	}
	close() {
		this.closed = true;
		this.onclose?.();
	}
	record(owner: string, subject: string, operation = 'create') {
		this.onmessage?.({
			data: JSON.stringify({
				kind: 'commit',
				did: owner,
				time_us: Date.now() * 1000,
				commit: {
					collection: CONNECTION_COLLECTION,
					operation,
					rkey: '3mtest',
					record: {
						$type: CONNECTION_COLLECTION,
						subject,
						createdAt: new Date().toISOString()
					}
				}
			})
		});
	}
}
function data(overrides: Partial<PageData> = {}): PageData {
	return {
		did: alice,
		profile: null,
		canPostToBluesky: false,
		isModerator: false,
		pageTitle: 'Meet · atmo.rsvp',
		pageDescription: 'Meet people.',
		target: null,
		selfScan: false,
		canMeet: true,
		connections: [],
		outgoingFailed: false,
		incomingFailed: false,
		...overrides
	};
}
function connection(owner: string, subject: string): Connection {
	return {
		uri: `at://${owner}/${CONNECTION_COLLECTION}/3mtest`,
		owner,
		subject,
		createdAt: new Date().toISOString()
	};
}

/** Rasterize the rendered SVG's actual theme colours, rather than testing an unstyled QR matrix. */
async function renderedQrCanvas(size = 320) {
	const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Your meeting QR code"]')!;
	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute('style', `color: ${getComputedStyle(svg).color}`);
	clone.removeAttribute('class');
	clone
		.querySelector('rect')!
		.setAttribute('fill', getComputedStyle(svg.querySelector('rect')!).fill);
	const url = URL.createObjectURL(
		new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
	);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		canvas.getContext('2d')!.drawImage(image, 0, 0, size, size);
		return canvas;
	} finally {
		URL.revokeObjectURL(url);
	}
}

beforeEach(() => {
	document.documentElement.classList.remove('dark');
	document.documentElement.classList.add('light');
	document.documentElement.style.colorScheme = 'light';
	vi.stubGlobal('WebSocket', FakeSocket);
	sockets.length =
		submissions.length =
		submissionSources.length =
		navigations.length =
		navigationOptions.length =
			0;
	mocks.user.did = alice;
	mocks.user.isLoggedIn = true;
	mocks.user.profile = { handle: 'alice.test' };
	vi.clearAllMocks();
	setRefresh(async () => {});
	setNextSave(connection(alice, bob));
	mocks.search.mockResolvedValue([]);
	mocks.resolve.mockImplementation(async (actor: string) =>
		actor.startsWith('did:') ? actor : bob
	);
});
afterEach(async () => {
	document.documentElement.classList.remove('dark', 'light');
	document.documentElement.style.removeProperty('color-scheme');
	vi.unstubAllGlobals();
	await page.viewport(1280, 1000);
});

describe('Meet tool', () => {
	it.each([1280, 390])('uses inset tool cards with responsive columns at %ipx', async (width) => {
		await page.viewport(width, 1000);
		await render(ToolsPage);
		const link = page.getByRole('link', { name: /Meet Scan a QR code/ });
		await expect.element(link).toBeVisible();
		const card = link.element();
		const grid = card.parentElement!;
		expect(getComputedStyle(card).boxShadow).toContain('inset');
		expect(getComputedStyle(grid).gridTemplateColumns.split(' ')).toHaveLength(
			width >= 768 ? 2 : 1
		);
		const ratio = card.getBoundingClientRect().width / grid.getBoundingClientRect().width;
		expect(ratio).toBeCloseTo(width >= 768 ? 0.5 : 1, 1);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
	});
	it.each(['light', 'dark'])('decodes the hand-drawn QR in %s mode at phone size', async (mode) => {
		document.documentElement.classList.remove('light', 'dark');
		document.documentElement.classList.add(mode);
		document.documentElement.style.colorScheme = mode;
		const value = `https://atmo.rsvp/tools/meet?did=${encodeURIComponent(alice)}`;
		await render(QrCode, { value });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		const canvas = await renderedQrCanvas(240);
		expect((await QrScanner.scanImage(canvas, { returnDetailedScanResult: true })).data).toBe(
			value
		);
		const screenshot = await page
			.getByRole('img', { name: 'Your meeting QR code' })
			.screenshot({ base64: true });
		const image = new Image();
		image.src = `data:image/png;base64,${screenshot.base64}`;
		await image.decode();
		expect((await QrScanner.scanImage(image, { returnDetailedScanResult: true })).data).toBe(value);
	});
	it('updates QR colours with the theme, without changing its geometry or content', async () => {
		await render(QrCode, { value: 'https://atmo.rsvp/tools/meet?actor=alice.test' });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Your meeting QR code"]')!;
		const path = svg.querySelector('path')!.getAttribute('d');
		const lightInk = getComputedStyle(svg).color;
		const lightPaper = getComputedStyle(svg.querySelector('rect')!).fill;
		document.documentElement.classList.replace('light', 'dark');
		document.documentElement.style.colorScheme = 'dark';
		expect(getComputedStyle(svg).color).not.toBe(lightInk);
		expect(getComputedStyle(svg.querySelector('rect')!).fill).not.toBe(lightPaper);
		expect(svg.querySelector('path')!.getAttribute('d')).toBe(path);
		expect(
			(await QrScanner.scanImage(await renderedQrCanvas(), { returnDetailedScanResult: true })).data
		).toBe('https://atmo.rsvp/tools/meet?actor=alice.test');
	});
	it('generates a scannable QR using the current handle', async () => {
		await render(MeetPage, { data: data(), form: null, params: {} });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		expect(
			(await QrScanner.scanImage(await renderedQrCanvas(), { returnDetailedScanResult: true })).data
		).toBe('https://atmo.rsvp/tools/meet?actor=alice.test');
		expect(submissions).toEqual([]);
	});
	it('confirms scanned people in an auto-closing modal without shifting the page or losing history', async () => {
		const target = { did: bob, profile: null };
		const saved = connection(alice, bob);
		const view = await render(MeetPage, { data: data(), form: null, params: {} });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		const height = view.container.getBoundingClientRect().height;
		const qrTop = document
			.querySelector('svg[aria-label="Your meeting QR code"]')!
			.getBoundingClientRect().top;
		await view.rerender({ data: data({ target }) });
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		expect(view.container.getBoundingClientRect().height).toBe(height);
		expect(
			document.querySelector('svg[aria-label="Your meeting QR code"]')!.getBoundingClientRect().top
		).toBe(qrTop);
		expect(submissions).toEqual([]);
		setNextSave(saved);
		setRefresh(async () => {
			await view.rerender({ data: data({ target, connections: [saved] }) });
		});
		await dialog.getByRole('button', { name: 'Yes, we met', exact: true }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		await expect.element(page.getByText('Meeting saved.', { exact: true })).toBeVisible();
		expect(view.container.getBoundingClientRect().height).toBe(height);
		await expect.element(page.getByText('Meeting saved.', { exact: true })).not.toBeInTheDocument();
		expect(navigations).toEqual(['/tools/meet']);
		expect(navigationOptions).toEqual([{ replace: true, reset: false }]);
		expect(view.container.getBoundingClientRect().height).toBe(height);
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		await expect.element(page.getByText('Waiting for them', { exact: true })).toBeVisible();
	});
	it('advances past an already-saved person without dismissing the next pending person', async () => {
		const view = await render(MeetPage, {
			data: data({ target: { did: bob, profile: null }, connections: [connection(alice, bob)] }),
			form: null,
			params: {}
		});
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		const carol = 'did:plc:cccccccccccccccccccccccc';
		await view.rerender({
			data: data({ target: { did: carol, profile: null }, connections: [connection(alice, bob)] }),
			form: null
		});
		await new Promise((resolve) => setTimeout(resolve, 3200));
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByRole('button', { name: 'Yes, we met', exact: true }))
			.toBeVisible();
		expect(dialog.element().querySelector<HTMLInputElement>('input[name="subject"]')!.value).toBe(
			carol
		);
		expect(navigations).toEqual([]);
		expect(submissions).toEqual([]);
	});
	it('dismisses scanned people without saving and does not stack a live confirmation over them', async () => {
		await render(MeetPage, {
			data: data({ target: { did: bob, profile: null } }),
			form: null,
			params: {}
		});
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		sockets[0]!.record(bob, alice);
		await expect.element(dialog).toBeVisible();
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(navigations).toEqual(['/tools/meet']);
		expect(submissions).toEqual([]);
	});
	it('falls back to a DID link when a handle is unavailable', async () => {
		mocks.user.profile = null;
		await render(MeetPage, { data: data(), form: null, params: {} });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		expect(
			(await QrScanner.scanImage(await renderedQrCanvas(), { returnDetailedScanResult: true })).data
		).toBe(`https://atmo.rsvp/tools/meet?did=${encodeURIComponent(alice)}`);
	});
	it('keeps old incoming and saved meetings in History, not the main tab', async () => {
		const old = { ...connection(bob, alice), createdAt: '' };
		const view = await render(MeetPage, {
			data: data({ connections: [old] }),
			form: null,
			params: {}
		});
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Yes, we met' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'People you met', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Yes, we met' })).toBeVisible();
		const saved = { ...connection(alice, bob), createdAt: '2025-04-03T12:34:56.123Z' };
		setNextSave(saved);
		setRefresh(async () => {
			await view.rerender({ data: data({ connections: [old, saved] }) });
		});
		await page.getByRole('button', { name: 'Yes, we met' }).click();
		await expect.element(page.getByText('Apr 3, 2025', { exact: true })).toBeVisible();
		expect(submissionSources).toEqual([old.uri]);
		await page.getByRole('tab', { name: 'Meet', exact: true }).click();
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		await expect.element(page.getByText('Apr 3, 2025', { exact: true })).not.toBeVisible();
		expect(sockets).toHaveLength(1);
	});
	it('prompts live, writes only after confirmation, and does not repeat replayed requests', async () => {
		const view = await render(MeetPage, { data: data(), form: null, params: {} });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		await expect
			.element(page.getByText('Listening for meetings', { exact: true }))
			.not.toBeInTheDocument();
		sockets[0]!.record(bob, alice);
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		expect(submissions).toEqual([]);
		const saved = connection(alice, bob);
		setNextSave(saved);
		setRefresh(async () => {
			await view.rerender({ data: data({ connections: [connection(bob, alice), saved] }) });
		});
		await dialog.getByRole('button', { name: 'Yes, we met' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		await expect.element(page.getByText('Both confirmed', { exact: true })).toBeVisible();
		expect(submissions).toEqual([bob]);
		expect(submissionSources).toEqual([connection(bob, alice).uri]);
		sockets[0]!.record(bob, alice);
		await expect.element(dialog).not.toBeInTheDocument();
		await view.unmount();
		expect(sockets[0]!.closed).toBe(true);
	});
	it('updates mutual status and deletions while History is open', async () => {
		await render(MeetPage, {
			data: data({ connections: [connection(alice, bob)] }),
			form: null,
			params: {}
		});
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		await expect.element(page.getByText('Waiting for them', { exact: true })).toBeVisible();
		sockets[0]!.record(bob, alice);
		await expect.element(page.getByText('Both confirmed', { exact: true })).toBeVisible();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		sockets[0]!.record(bob, alice, 'delete');
		await expect.element(page.getByText('Waiting for them', { exact: true })).toBeVisible();
		expect(submissions).toEqual([]);
	});
	it('reconciles deleted live records with server history after reconnecting', async () => {
		const view = await render(MeetPage, { data: data(), form: null, params: {} });
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		sockets[0]!.record(alice, bob);
		sockets[0]!.record(bob, alice);
		await expect.element(page.getByText('Both confirmed', { exact: true })).toBeVisible();
		setRefresh(async () => {
			// The deletion was missed by Jetstream, but the fresh PDS read knows about it.
			await view.rerender({ data: data({ connections: [connection(bob, alice)] }) });
		});
		sockets[0]!.close();
		await expect.element(page.getByRole('button', { name: 'Yes, we met' })).toBeVisible();
		await expect.element(page.getByText('Both confirmed', { exact: true })).not.toBeInTheDocument();
		expect(sockets).toHaveLength(2);
	});
	it('keeps live events received during a history retry', async () => {
		const view = await render(MeetPage, {
			data: data({ incomingFailed: true }),
			form: null,
			params: {}
		});
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		sockets[0]!.record(alice, bob);
		await expect.element(page.getByText('Waiting for them', { exact: true })).toBeVisible();
		setRefresh(async () => {
			await view.rerender({ data: data() });
			sockets[0]!.record(bob, alice);
			sockets[0]!.record(alice, bob, 'delete');
		});
		await page.getByRole('button', { name: 'Retry', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Yes, we met' })).toBeVisible();
		await expect
			.element(page.getByText('Waiting for them', { exact: true }))
			.not.toBeInTheDocument();
		expect(sockets).toHaveLength(1);
	});
	it('allows declining without creating a reciprocal record', async () => {
		await render(MeetPage, { data: data(), form: null, params: {} });
		sockets[0]!.record(bob, alice);
		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Not now' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(submissions).toEqual([]);
	});
	it('accepts You & Me links and DIDs, without writing or searching their contents', async () => {
		await render(MeetPage, { data: data(), form: null, params: {} });
		const input = page.getByRole('combobox', { name: 'Meet someone' });
		await input.fill(`https://evil.test/connect?did=${bob}`);
		await page.getByRole('button', { name: 'Open', exact: true }).click();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Enter a valid handle, meeting link, or DID.');
		expect(navigations).toEqual([]);
		await input.fill(`https://youandme.at/connect?did=${bob}`);
		await page.getByRole('button', { name: 'Open', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		expect(mocks.resolve).toHaveBeenCalledWith(bob);
		await dialog.getByRole('button', { name: 'Not now', exact: true }).click();
		await input.fill(bob);
		await page.getByRole('button', { name: 'Open', exact: true }).click();
		expect(mocks.resolve).toHaveBeenCalledOnce();
		expect(navigations).toEqual([]);
		expect(mocks.search).not.toHaveBeenCalled();
		expect(submissions).toEqual([]);
	});
	it('offers login-style handle suggestions and opens the selected account', async () => {
		mocks.search.mockResolvedValue([{ did: bob, handle: 'bob.test', displayName: 'Bob Example' }]);
		await render(MeetPage, { data: data(), form: null, params: {} });
		await page.getByRole('combobox', { name: 'Meet someone' }).fill('bob');
		const option = page.getByRole('option', { name: /Bob Example/ });
		await expect.element(option).toBeVisible();
		await option.click();
		await expect.element(page.getByRole('dialog', { name: 'Did you meet?' })).toBeVisible();
		expect(mocks.resolve).toHaveBeenCalledWith('bob.test');
		expect(navigations).toEqual([]);
		expect(submissions).toEqual([]);
	});
	it('opens a typed handle even if account search is unavailable', async () => {
		mocks.search.mockRejectedValue(new Error('offline'));
		await render(MeetPage, { data: data(), form: null, params: {} });
		await page.getByRole('combobox', { name: 'Meet someone' }).fill('@Bob.Test');
		await page.getByRole('button', { name: 'Open', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Did you meet?' })).toBeVisible();
		expect(mocks.resolve).toHaveBeenCalledWith('bob.test');
		expect(navigations).toEqual([]);
	});
	it('requests incremental permission for an old session', async () => {
		await render(MeetPage, { data: data({ canMeet: false }), form: null, params: {} });
		await page.getByRole('button', { name: 'Enable meetings' }).click();
		expect(mocks.authorize).toHaveBeenCalledOnce();
		expect(submissions).toEqual([]);
	});
	it('starts the camera only on request and releases it on switching tabs', async () => {
		const start = vi.spyOn(QrScanner.prototype, 'start').mockResolvedValue();
		const destroy = vi.spyOn(QrScanner.prototype, 'destroy');
		try {
			await render(MeetPage, { data: data(), form: null, params: {} });
			const qr = page.getByRole('img', { name: 'Your meeting QR code' });
			await expect.element(qr).toBeVisible();
			const previewWidth = qr.element().getBoundingClientRect().width;
			expect(start).not.toHaveBeenCalled();
			await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
			const camera = page.getByLabelText('QR scanner camera preview');
			await expect.element(camera).toBeVisible();
			await expect.element(qr).not.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
			expect(camera.element().getBoundingClientRect().width).toBeCloseTo(previewWidth, 0);
			await expect.poll(() => start.mock.calls.length).toBe(1);
			await page.getByRole('button', { name: 'Close camera' }).click();
			await expect.element(qr).toBeVisible();
			await expect.element(camera).not.toBeInTheDocument();
			expect(destroy).toHaveBeenCalledOnce();
			await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
			await expect.poll(() => start.mock.calls.length).toBe(2);
			await page.getByRole('tab', { name: 'History', exact: true }).click();
			expect(destroy).toHaveBeenCalledTimes(2);
		} finally {
			start.mockRestore();
			destroy.mockRestore();
		}
	});
	it('keeps a failed confirmation at the front and preserves the next person’s original record on retry', async () => {
		const target = { did: bob, profile: null };
		const carol = 'did:plc:cccccccccccccccccccccccc';
		const incoming = connection(carol, alice);
		const view = await render(MeetPage, { data: data({ target }), form: null, params: {} });
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		sockets[0]!.record(carol, alice);
		setNextSaveFailure('Could not save. Try again.');
		setRefresh(async () => {
			await view.rerender({
				data: data({ target, connections: [incoming] }),
				form: { message: 'Could not save. Try again.' }
			});
		});
		await dialog.getByRole('button', { name: 'Yes, we met', exact: true }).click();
		await expect.element(dialog.getByRole('alert')).toHaveTextContent('Could not save. Try again.');
		expect(dialog.element().querySelector<HTMLInputElement>('input[name="subject"]')!.value).toBe(
			bob
		);
		const saved = connection(alice, bob);
		setNextSave(saved);
		// A lagging backlink index no longer includes Carol, but the queue retains her source URI.
		setRefresh(async () => {
			await view.rerender({ data: data({ target, connections: [saved] }), form: null });
		});
		await dialog.getByRole('button', { name: 'Yes, we met', exact: true }).click();
		await expect
			.poll(() => dialog.element().querySelector<HTMLInputElement>('input[name="subject"]')?.value)
			.toBe(carol);
		expect(
			dialog.element().querySelector<HTMLInputElement>('input[name="incomingUri"]')!.value
		).toBe(incoming.uri);
		await expect.element(dialog.getByRole('alert')).not.toBeInTheDocument();
		expect(submissions).toEqual([bob, bob]);
		await dialog.getByRole('button', { name: 'Not now' }).click();
	});
	it('keeps scanning and queues three people for individual confirmation without duplicate scans', async () => {
		let decode!: (result: { data: string }) => void;
		const start = vi.spyOn(QrScanner.prototype, 'start').mockImplementation(function (
			this: QrScanner
		) {
			decode = (this as unknown as { _onDecode: typeof decode })._onDecode;
			return Promise.resolve();
		});
		const stop = vi.spyOn(QrScanner.prototype, 'stop');
		const destroy = vi.spyOn(QrScanner.prototype, 'destroy');
		try {
			const view = await render(MeetPage, { data: data(), form: null, params: {} });
			await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
			await expect.poll(() => start.mock.calls.length).toBe(1);
			const people = [bob, 'did:plc:cccccccccccccccccccccccc', 'did:plc:dddddddddddddddddddddddd'];
			for (const did of people) decode({ data: `https://youandme.at/connect?did=${did}` });
			decode({ data: `https://youandme.at/connect?did=${bob}` });
			const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
			await expect
				.element(
					dialog.getByText('3 people queued. Confirm to save a public connection.', { exact: true })
				)
				.toBeVisible();
			expect(submissions).toEqual([]);
			const saved: Connection[] = [];
			for (const did of people) {
				expect(
					dialog.element().querySelector<HTMLInputElement>('input[name="subject"]')!.value
				).toBe(did);
				const record = connection(alice, did);
				saved.push(record);
				setNextSave(record);
				setRefresh(async () => {
					await view.rerender({ data: data({ connections: [...saved] }) });
				});
				await dialog.getByRole('button', { name: 'Yes, we met', exact: true }).click();
				await expect.poll(() => submissions.length).toBe(saved.length);
				await expect
					.poll(() => document.querySelector<HTMLInputElement>('input[name="subject"]')?.value)
					.not.toBe(did);
			}
			await expect.element(dialog).not.toBeInTheDocument();
			await expect.element(page.getByLabelText('QR scanner camera preview')).toBeVisible();
			expect(submissions).toEqual(people);
			expect(start).toHaveBeenCalledOnce();
			expect(stop).not.toHaveBeenCalled();
			expect(destroy).not.toHaveBeenCalled();
			expect(navigations).toEqual([]);
			await page.getByRole('button', { name: 'Close camera' }).click();
			expect(destroy).toHaveBeenCalledOnce();
		} finally {
			start.mockRestore();
			stop.mockRestore();
			destroy.mockRestore();
		}
	});
	it('asks signed-out visitors to log in without subscribing or writing', async () => {
		mocks.user.did = null;
		mocks.user.isLoggedIn = false;
		await render(MeetPage, { data: data({ canMeet: false, did: null }), form: null, params: {} });
		await page.getByRole('button', { name: 'Log in', exact: true }).click();
		expect(mocks.login).toHaveBeenCalledOnce();
		expect(sockets).toEqual([]);
		expect(submissions).toEqual([]);
	});
	it('preserves a scanned link when opening login from its person modal', async () => {
		mocks.user.did = null;
		mocks.user.isLoggedIn = false;
		await render(MeetPage, {
			data: data({ canMeet: false, did: null, target: { did: bob, profile: null } }),
			form: null,
			params: {}
		});
		const dialog = page.getByRole('dialog', { name: 'Did you meet?' });
		await expect.element(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Log in', exact: true }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(mocks.login).toHaveBeenCalledOnce();
		expect(navigations).toEqual([]);
		expect(submissions).toEqual([]);
	});
	it.each([
		[320, 568],
		[375, 667],
		[390, 844]
	])('fits QR and camera modes on a %i×%i mobile screen', async (width, height) => {
		await page.viewport(width, height);
		const start = vi.spyOn(QrScanner.prototype, 'start').mockResolvedValue();
		try {
			const view = await render(MeetPage, { data: data(), form: null, params: {} });
			const qr = page.getByRole('img', { name: 'Your meeting QR code' });
			await expect.element(qr).toBeVisible();
			// Reserve the app's mobile navigation header and legal footer, not just the page content.
			const availableHeight = height - 56 - 80;
			expect(view.container.getBoundingClientRect().height).toBeLessThanOrEqual(availableHeight);
			const qrSize = Math.floor(qr.element().getBoundingClientRect().width);
			expect(
				(
					await QrScanner.scanImage(await renderedQrCanvas(qrSize), {
						returnDetailedScanResult: true
					})
				).data
			).toBe('https://atmo.rsvp/tools/meet?actor=alice.test');
			await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
			await expect.poll(() => start.mock.calls.length).toBe(1);
			await expect.element(page.getByText('Scan their QR code.', { exact: true })).toBeVisible();
			expect(view.container.getBoundingClientRect().height).toBeLessThanOrEqual(availableHeight);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
		} finally {
			start.mockRestore();
		}
	});
	it('fits mobile and has no serious accessibility violations', async () => {
		await page.viewport(390, 844);
		await render(MeetPage, { data: data(), form: null, params: {} });
		await expect.element(page.getByRole('img', { name: 'Your meeting QR code' })).toBeVisible();
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
		const result = await axe.run(document.body, { rules: { region: { enabled: false } } });
		expect(
			result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
		).toEqual([]);
	});
});
