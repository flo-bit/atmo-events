// A new person's first event, on a local atproto network: they sign up at the PDS through atmo,
// publish an event, share it to Bluesky, and once people RSVP, the event's starter pack lists
// them. Writes are checked where they land (repos on the PDS, and what atmo serves on a fresh
// request), not from what a page says after a click.
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
	ATMO,
	BOT_HANDLE,
	CDN,
	EVENT,
	LIST_ITEM,
	POST,
	RSVP,
	STARTER_PACK,
	atmoEvent,
	createPerson,
	createRecord,
	records,
	rkeyOf,
	runCron,
	signIn,
	signUp,
	type Person
} from './network';

const run = Date.now().toString(36);
const eventName = `Picnic ${run}`;
const cron = () => runCron(inject('cronSecret'));
// Writes reach the PDS within seconds; the bot's pack takes longest.
const soon = { timeout: 30_000, interval: 500 };

/** Runs atmo's cron until `check` passes. Each run reads the network's Jetstream for 20 s. */
function afterIngest<T>(check: () => Promise<T>) {
	return expect.poll(
		async () => {
			await cron();
			return check();
		},
		{ timeout: 90_000, interval: 1_000 }
	);
}

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch();
	// The first run sets where atmo starts reading Jetstream, so what the tests write comes after.
	await cron();
});
afterAll(async () => {
	await browser?.close();
});

describe('a new person on a local atproto network', () => {
	let host: { page: Page; handle: string };
	let event: { uri: string; cid: string };
	let guest: Person;
	const eventPage = () => `${ATMO}/p/${host.handle}/e/${rkeyOf(event.uri)}`;

	it('signs up at their PDS through atmo, and is signed in', async () => {
		host = await signUp(browser, `host${run}`);
		// Creating an event sends a signed-out visitor to /login.
		await host.page.goto(`${ATMO}/create`, { waitUntil: 'networkidle' });
		expect(new URL(host.page.url()).pathname).toBe('/create');
	});

	it('publishes an event to their own repo, and atmo shows it', async () => {
		const { page } = host;
		await page.locator('main [contenteditable=true]').first().click();
		await page.keyboard.type(eventName);
		await page.getByRole('button', { name: /^start date/i }).click();
		await page.keyboard.press('ArrowRight'); // tomorrow, so the event is upcoming
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: /^publish/i }).click();
		await page.waitForURL((url) => url.pathname !== '/create', { timeout: 45_000 });

		const published = (await records<{ name?: string }>(host.handle, EVENT)).find(
			(r) => r.value.name === eventName
		);
		expect(published).toBeDefined();
		event = { uri: published!.uri, cid: published!.cid };
		await afterIngest(
			async () => (await atmoEvent(host.handle, rkeyOf(event.uri)))?.value?.name
		).toBe(eventName);
	});

	it("shows a visitor the event's picture, from the network's own image CDN", async () => {
		type Media = { media?: { content?: { ref?: { $link?: string } } }[] };
		const published = (await records<Media>(host.handle, EVENT)).find((r) => r.uri === event.uri);
		const picture = published?.value.media?.[0]?.content?.ref?.$link;
		expect(picture).toBeDefined();

		// A visitor of their own, so the host's page keeps atmo's offer to share the new event.
		const visitor = await browser.newContext({ ignoreHTTPSErrors: true });
		try {
			const page = await visitor.newPage();
			await page.goto(eventPage(), { waitUntil: 'networkidle' });
			const img = page.locator(`img[src*="${picture}"]`).first();
			await img.waitFor({ state: 'attached' });
			// From the network's own CDN, not the public one or atmo itself.
			const src = await img.getAttribute('src');
			expect(new URL(src ?? '', ATMO).origin).toBe(new URL(CDN).origin);
			// Loaded, not just linked: the public CDN answers 404 for an account on this network.
			await expect
				.poll(
					() => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0)),
					soon
				)
				.toBeGreaterThan(0);
		} finally {
			await visitor.close();
		}
	});

	it('shares it to Bluesky: the post links the event, and the event links the post', async () => {
		const { page } = host;
		// atmo offers to share a new event as soon as it is published.
		await page.getByRole('button', { name: /^share to bluesky$/i }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /^post$/i })
			.click();

		const post = async () =>
			(await records<{ embed?: { external?: { uri?: string } } }>(host.handle, POST)).find(
				(r) => r.value.embed?.external?.uri === eventPage()
			)?.uri;
		await expect.poll(post, soon).toBeDefined();
		const linked = async () =>
			(await records<{ bskyPostRef?: { uri?: string } }>(host.handle, EVENT)).find(
				(r) => r.uri === event.uri
			)?.value.bskyPostRef?.uri;
		await expect.poll(linked, soon).toBe(await post());
	});

	it('gets an RSVP from someone who signs in at their own PDS', async () => {
		guest = await createPerson(`guest${run}`);
		const page = await signIn(browser, guest);
		await page.goto(eventPage(), { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: /^going$/i }).click();

		const rsvp = async () =>
			(await records<{ subject?: { uri?: string }; status?: string }>(guest.handle, RSVP)).find(
				(r) => r.value.subject?.uri === event.uri
			)?.value.status;
		await expect.poll(rsvp, soon).toBe(`${RSVP}#going`);
		await afterIngest(async () =>
			(await atmoEvent(host.handle, rkeyOf(event.uri)))?.rsvps?.going?.map((a) => a.did)
		).toContain(guest.did);
	});

	it('makes a starter pack of the people going, once there are six', async () => {
		// Five more people RSVP from their own PDS, without atmo: atmo takes them from Jetstream.
		const others: Person[] = [];
		for (let i = 1; i <= 5; i++) {
			const person = await createPerson(`guest${run}${i}`);
			await createRecord(person, RSVP, {
				subject: event,
				status: `${RSVP}#going`,
				createdAt: new Date().toISOString()
			});
			others.push(person);
		}
		await afterIngest(
			async () => (await atmoEvent(host.handle, rkeyOf(event.uri)))?.rsvps?.going?.length ?? 0
		).toBeGreaterThanOrEqual(6);

		const { page } = host;
		// The pack opens on Bluesky's site; keep the test on this network.
		await page.context().route(/^https:\/\/bsky\.app\//, (route) => route.abort());
		await page.goto(eventPage(), { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: /^starter pack/i }).click();

		// atmo's bot keeps the pack in its own repo, with a list of the event's people.
		const findPack = async () =>
			(await records<{ name?: string; list?: string }>(BOT_HANDLE, STARTER_PACK)).find(
				(r) => r.value.name === eventName
			);
		await expect.poll(findPack, soon).toBeDefined();
		const pack = (await findPack())!;
		const members = (await records<{ list?: string; subject?: string }>(BOT_HANDLE, LIST_ITEM))
			.filter((r) => r.value.list === pack.value.list)
			.map((r) => r.value.subject);
		// Everyone going: the guest who RSVPed through atmo, and the five who did not.
		expect(members).toEqual(expect.arrayContaining([guest.did, ...others.map((p) => p.did)]));

		// And the page now links to that pack.
		const link = page.getByRole('link', { name: /^starter pack/i });
		await link.waitFor({ timeout: 30_000 });
		expect(await link.getAttribute('href')).toContain(rkeyOf(pack.uri));
	});
});
