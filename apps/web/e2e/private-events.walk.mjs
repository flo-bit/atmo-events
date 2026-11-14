// A person's private event through atmo's real pages, with real OAuth at real spaces PDSes. One browser
// context per person. After each step the state is read from the PDSes with password sessions, not
// trusted from the page. Prints statuses, never a password.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ATMO = process.env.WALK_ATMO ?? 'http://127.0.0.1:5454';
const OUT = process.env.WALK_OUT ?? '/tmp/private-events-walk';
fs.mkdirSync(OUT, { recursive: true });
const need = (n) => {
	const v = process.env[n]?.trim();
	if (!v) throw new Error(`${n} not set`);
	return v;
};
const person = (who, pds) => ({
	who,
	handle: need(`${who.toUpperCase()}_HANDLE`),
	password: need(`${who.toUpperCase()}_PASSWORD`),
	pds: need(`${pds}_URL`)
});
const P = {
	alice: person('alice', 'ALPHA'),
	bob: person('bob', 'ALPHA'),
	mallory: person('mallory', 'ALPHA'),
	dana: person('dana', 'BETA'),
	carol: person('carol', 'REGULAR')
};
const TYPE = 'rsvp.atmo.dev.space';
const EVENT = 'community.lexicon.calendar.event';
const RSVP = 'community.lexicon.calendar.rsvp';

const secrets = Object.entries(process.env)
	.filter(([k]) => /PASSWORD/.test(k))
	.map(([, v]) => v);
const mask = (s) => secrets.reduce((t, x) => (x ? t.split(x).join('<masked>') : t), String(s));
const log = (...a) =>
	console.log(mask(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')));
const clean = (s, n = 400) => mask(String(s).replace(/\s+/g, ' ').trim()).slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.env.WALK_RESOLVER
	? [`--host-resolver-rules=${process.env.WALK_RESOLVER}`]
	: [];
const browser = await chromium.launch({ args });
let pageErrors = 0;
const shot = (page, name) =>
	page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
const pageFor = async (who) => {
	const ctx = await browser.newContext({
		ignoreHTTPSErrors: true,
		viewport: { width: 1100, height: 850 }
	});
	const page = await ctx.newPage();
	page.on('pageerror', (e) => {
		pageErrors++;
		log(`  [${who}] browser error: ${clean(e.message, 200)}`);
	});
	return page;
};
// Whole, and it throws rather than giving '', so a check that something is absent can't pass on a page
// that never loaded or on what lies past a cut.
const text = async (page, sel = 'body') =>
	clean(await page.locator(sel).first().innerText({ timeout: 15000 }), Infinity);

async function throughPds(page, who) {
	for (let i = 0; i < 160; i++) {
		const u = new URL(page.url());
		// Only the PDS's own buttons are clicked here. A fast server lands back on atmo within the
		// first polls, and atmo's own "Allow atmo to ..." would skip the step that tests it.
		if (u.origin === ATMO) {
			if (i > 2) {
				await page.waitForLoadState('load').catch(() => {});
				return;
			}
			await sleep(400);
			continue;
		}
		const pw = page.locator('input[name=password]');
		if (await pw.isVisible().catch(() => false)) {
			const user = page.locator('input[name=username]');
			if ((await user.count()) && (await user.isEditable()) && !(await user.inputValue())) {
				await user.fill(who.handle);
			}
			await pw.fill(who.password);
			await page.locator('button[type=submit]').last().click();
			await sleep(800);
			continue;
		}
		// Never atmo's own button: isVisible waits out a navigation, so `u` above can be stale here.
		const btn = page.getByRole('button', { name: /^(accept|authorize|allow(?! atmo))/i }).first();
		if (await btn.isVisible().catch(() => false)) {
			await btn.click({ timeout: 10000 });
			await sleep(800);
			continue;
		}
		await sleep(400);
	}
	throw new Error(
		`stuck at the PDS for ${who.who}: ${page.url().split('?')[0]} ${await text(page).catch(() => '')}`
	);
}
async function signInForm(page, who) {
	await page.locator('input[name=handle]').last().waitFor({ timeout: 30000 });
	await page.locator('input[name=handle]').last().fill(who.handle);
	await page
		.getByRole('button', { name: /^log in/i })
		.last()
		.click();
	await page.getByRole('button', { name: /^continue to log in/i }).click({ timeout: 15000 });
	await page.waitForURL((u) => u.origin !== ATMO, { timeout: 30000 });
	await throughPds(page, who);
	log(`  [${who.who}] signed in, back at ${new URL(page.url()).pathname}`);
}
async function signIn(page, who) {
	await page.goto(ATMO, { waitUntil: 'networkidle', timeout: 60000 });
	await page
		.getByRole('button', { name: /^log in$/i })
		.first()
		.click();
	await signInForm(page, who);
}
async function allow(page, name, who, within = page) {
	await within.getByRole('button', { name }).click({ timeout: 30000 });
	await page.waitForURL((u) => u.origin !== ATMO, { timeout: 30000 });
	await throughPds(page, who);
	await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}
/** Clicks an answer, then waits for it on the PDS, and says what the page says if it never lands. */
async function answer(page, name, who, want) {
	await page.getByRole('button', { name }).first().click({ timeout: 20000 });
	for (let i = 0; i < 40; i++) {
		if ((await ownRsvp(who)) === want) return true;
		await sleep(250);
	}
	log(`  [${who}] the page says: ${await text(page, 'main')}`);
	return false;
}

async function checker(who) {
	const res = await fetch(`${who.pds}/xrpc/com.atproto.server.createSession`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ identifier: who.handle, password: who.password })
	});
	if (!res.ok) throw new Error(`createSession ${who.who}: ${res.status}`);
	const { accessJwt, did } = await res.json();
	const call = async (nsid, params) => {
		const u = new URL(`/xrpc/${nsid}`, who.pds);
		for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
		const r = await fetch(u, { headers: { authorization: `Bearer ${accessJwt}` } });
		return { status: r.status, data: await r.json().catch(() => null) };
	};
	const write = async (collection, record) => {
		const r = await fetch(`${who.pds}/xrpc/com.atproto.repo.createRecord`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${accessJwt}` },
			body: JSON.stringify({ repo: did, collection, record: { $type: collection, ...record } })
		});
		if (!r.ok) throw new Error(`createRecord ${who.who}: ${r.status}`);
		return r.json();
	};
	return { ...who, did, call, write };
}
const C = {};
for (const [k, v] of Object.entries(P)) C[k] = await checker(v);
const JETSTREAM = need('JETSTREAM_URL');
const CRON_SECRET = need('CRON_SECRET');
const runCron = async () => {
	const r = await fetch(`${ATMO}/api/cron`, {
		method: 'POST',
		// As the built Worker's own scheduled() sends it: SvelteKit 3 refuses a POST with no content type.
		headers: { 'X-Cron-Secret': CRON_SECRET, 'content-type': 'application/json' }
	});
	if (!r.ok) throw new Error(`atmo's cron: ${r.status}`);
};
await runCron();

let failures = 0;
const check = (label, ok, detail = '') => {
	log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
	if (!ok) failures++;
};
const pages = {};
const step = async (title, fn) => {
	log(`===== ${title}`);
	const t0 = Date.now();
	try {
		const v = await fn();
		log(`  (${Date.now() - t0} ms)`);
		return v;
	} catch (e) {
		log(`  STEP FAILED: ${clean(e.message, 700)}`);
		for (const [k, p] of Object.entries(pages)) await shot(p, `fail-${k}`);
		await browser.close();
		process.exit(1);
	}
};

let KEY, SPACE, EVENT_PATH;
// Its own name each run: accounts outlive a run, and so can an earlier run's event.
const NAME = `Dinner ${Date.now().toString(36)}`;
const RENAMED = `${NAME} at eight`;
const PUBLIC_NAME = `Public control ${Date.now().toString(36)}`;
const NOT_AVAILABLE = "This event isn't available";
const members = async () => {
	const r = await C.alice.call('com.atproto.memberspace.listMembers', { space: SPACE });
	if (r.status !== 200) throw new Error(`listMembers: ${r.status}`);
	return r.data.members.map((m) => m.did);
};
const ownRsvp = async (name) => {
	const c = C[name];
	const r = await c.call('com.atproto.space.getRecord', {
		space: SPACE,
		repo: c.did,
		collection: RSVP,
		rkey: KEY
	});
	if (r.status === 200) return r.data.value.status.split('#')[1];
	if (r.data?.error === 'RecordNotFound') return null;
	throw new Error(`getRecord ${name}: ${r.status} ${r.data?.error}`);
};
const publicCount = async (name, collection) => {
	const c = C[name];
	const r = await fetch(
		`${c.pds}/xrpc/com.atproto.repo.listRecords?${new URLSearchParams({ repo: c.did, collection })}`
	);
	if (!r.ok) throw new Error(`listRecords ${name}: ${r.status}`);
	return (await r.json()).records.length;
};
// Under vite dev a click before hydration does nothing, so wait for the network to settle.
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const open = async (page, target = EVENT_PATH) => {
	const res = await page.goto(`${ATMO}${target}`, { waitUntil: 'load', timeout: 60000 });
	await settle(page);
	return res?.status();
};
// What someone kept out receives, with the address itself removed. `+page.server.ts` says these match
// byte for byte, so that a person can't tell an event that exists from one that doesn't.
const received = async (page, target) => {
	const t0 = Date.now();
	const res = await page.goto(`${ATMO}${target}`, { waitUntil: 'load', timeout: 60000 });
	const ms = Date.now() - t0;
	const keyOf = target.split('/').at(-1);
	const withoutKey = (text) => text.split(keyOf).join('<key>');
	// Every header but the clock, so that any header telling the two apart shows here.
	const headers = Object.entries(res.headers())
		.filter(([name]) => name !== 'date')
		.sort(([a], [b]) => a.localeCompare(b));
	return {
		ms,
		status: res.status(),
		headers: withoutKey(JSON.stringify(headers)),
		body: withoutKey(await res.text())
	};
};
const firstDifference = (a, b) => {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return `at ${i} of ${a.length}/${b.length}: ${clean(a.slice(i, i + 90))} | ${clean(b.slice(i, i + 90))}`;
};
const sameAsMadeUp = async (who, page, label) => {
	const made = EVENT_PATH.replace(KEY, '3kzzzzzzzzzzz');
	const a = await received(page, EVENT_PATH);
	const b = await received(page, made);
	check(
		`${label}: 404 at the real address and a made-up one`,
		a.status === 404 && b.status === 404,
		`${a.status} ${b.status}`
	);
	check(
		`${label}: the same headers`,
		a.headers === b.headers,
		a.headers === b.headers ? '' : firstDifference(a.headers, b.headers)
	);
	check(
		`${label}: the same bytes`,
		a.body === b.body,
		a.body === b.body ? '' : firstDifference(a.body, b.body)
	);
	check(`${label}: not the event's name in the response`, !a.body.includes(NAME));
	log(`  [${who}] ms real ${a.ms} made-up ${b.ms}`);
};
const listLoads = async (page, label) => {
	const status = await open(page, '/private');
	check(`${label}: /private loaded`, status === 200, `${status}`);
};
// The attendee list, not the host's guest list, which names everyone added. The page shows only
// avatars there, so this opens the list of names.
const inAttendees = async (page, group, handle) => {
	const opener = page
		.locator('main button', { hasText: new RegExp(`\\d+\\s*${group}`, 'i') })
		.first();
	if ((await opener.count()) === 0) return false;
	await opener.click({ timeout: 10000 });
	const dialog = page.getByRole('dialog');
	await dialog.waitFor({ timeout: 10000 });
	const found = (await dialog.locator(`a[href="/p/${encodeURIComponent(handle)}"]`).count()) > 0;
	await page.keyboard.press('Escape');
	await dialog.waitFor({ state: 'detached', timeout: 10000 });
	return found;
};
const guestRow = (page, name) => page.locator(`[data-guest="${C[name].did}"]`);
const addGuest = async (page, who) => {
	await page.locator('input[name=guest-handle]').fill(who);
	await page.waitForTimeout(150);
	await page.locator('[data-testid=guest-list] form button[type=submit]').click();
};

await step('1. alice signs in with the ordinary login', async () => {
	pages.alice = await pageFor('alice');
	await signIn(pages.alice, P.alice);
});

await step('1b. alice turns on the private events beta in Settings', async () => {
	const p = pages.alice;
	await open(p, '/create');
	await p.getByRole('button', { name: /^publish/i }).waitFor({ timeout: 30000 });
	check(
		'no private choice before the beta is on',
		!(await p
			.getByText('Who can see this event?')
			.isVisible()
			.catch(() => false))
	);
	await open(p, '/settings');
	const section = p.locator('[data-testid=private-events-beta]');
	await section.waitFor({ timeout: 20000 });
	check('Settings says what the beta costs', /will be lost/.test(await section.innerText()));
	// Settings has one "Authorize now" per setting, so this is the private events one.
	await allow(p, /authorize now/i, P.alice, section);
	await settle(p);
	await section.getByRole('checkbox', { name: /try private events/i }).click({ timeout: 20000 });
	await section.getByRole('button', { name: /^save$/i }).click();
	await section.getByText('Saved.').waitFor({ timeout: 20000 });
	await shot(p, '00-settings-beta');
	const saved = await C.alice.call('com.atproto.repo.getRecord', {
		repo: C.alice.did,
		collection: 'rsvp.atmo.actor.privateEventsBeta',
		rkey: 'self'
	});
	check(
		'the switch is a record in her own repo',
		saved.status === 200 && saved.data?.value?.privateEvents === true,
		JSON.stringify(saved.data?.value ?? saved.status)
	);
});

await step('2. alice picks invited people only on /create and allows it', async () => {
	const p = pages.alice;
	await open(p, '/create');
	await p.getByText('Who can see this event?').waitFor({ timeout: 30000 });
	check(
		'no editor before a choice',
		!(await p
			.getByRole('button', { name: /^publish/i })
			.isVisible()
			.catch(() => false))
	);
	await p.getByRole('radio', { name: /invited people only/i }).click();
	await p.locator('[data-testid=grant-notice]').waitFor({ timeout: 10000 });
	await shot(p, '01-create-ask');
	await allow(p, /allow atmo to host/i, P.alice);
	await settle(p);
	check(
		'comes back to the choice she made',
		new URL(p.url()).searchParams.get('audience') === 'invited',
		p.url()
	);
});

await step('3. alice fills in the editor and publishes', async () => {
	const p = pages.alice;
	await p.locator('main [contenteditable=true]').first().waitFor({ timeout: 30000 });
	const body = await text(p, 'main');
	check(
		'no Public / Unlisted switch',
		!/Unlisted/.test(await p.locator('main').innerText()),
		body.slice(0, 80)
	);
	await p.locator('main [contenteditable=true]').first().click();
	await p.keyboard.type(NAME);
	await p.getByRole('button', { name: /^start date/i }).click();
	await p.keyboard.press('ArrowRight');
	await p.keyboard.press('Enter');
	await shot(p, '02-create-editor');
	await p.getByRole('button', { name: /^publish/i }).click();
	await p.waitForURL((u) => /\/private\/[^/]+$/.test(u.pathname), { timeout: 45000 });
	await settle(p);
	EVENT_PATH = new URL(p.url()).pathname;
	KEY = EVENT_PATH.split('/').at(-1);
	SPACE = `at://${C.alice.did}/space/${TYPE}/${KEY}`;
	await p.getByRole('heading', { name: NAME }).first().waitFor({ timeout: 20000 });
	await shot(p, '03-event-host');
	check('0 events in her public repo', (await publicCount('alice', EVENT)) === 0);
	const inSpace = await C.alice.call('com.atproto.space.getRecord', {
		space: SPACE,
		repo: C.alice.did,
		collection: EVENT,
		rkey: KEY
	});
	check('the event is in the space', inSpace.status === 200, inSpace.data?.value?.name);
	check('it has no image', !inSpace.data?.value?.media?.length);
	check(
		'it has no discovery preference, since nothing lists it',
		inSpace.data?.value?.preferences === undefined,
		JSON.stringify(inSpace.data?.value?.preferences)
	);
	const policy = await C.alice.call('com.atproto.space.getSpace', { space: SPACE });
	check('memberspace policy', policy.data?.policy?.$type === 'com.atproto.memberspace.policy');
	const blobs = await C.alice.call('com.atproto.sync.listBlobs', { did: C.alice.did });
	check(
		'no blob uploaded',
		blobs.status === 200 && blobs.data.cids.length === 0,
		`${blobs.status}`
	);
});

await step('4. someone signed out opens the address', async () => {
	const p = await pageFor('visitor');
	const raw = await p.request.get(`${ATMO}${EVENT_PATH}`);
	const html = await raw.text();
	check('the event name is nowhere in the HTML', !html.includes(NAME), `status ${raw.status()}`);
	await open(p);
	check('asks them to sign in', /sign in to see whether/i.test(await text(p)));
	await p.context().close();
});

await step('5. alice adds guests by handle', async () => {
	const p = pages.alice;
	await addGuest(p, P.bob.handle);
	await guestRow(p, 'bob').waitFor({ timeout: 20000 });
	check('bob listed, not answered', /hasn't answered/.test(await guestRow(p, 'bob').innerText()));
	check(
		'the host is told the link is the invitation',
		/link is the invitation/i.test(await text(p, '[data-testid=guest-list]'))
	);
	await addGuest(p, P.dana.handle);
	await guestRow(p, 'dana').waitFor({ timeout: 20000 });
	await addGuest(p, P.carol.handle);
	await guestRow(p, 'carol').waitFor({ timeout: 20000 });
	await addGuest(p, 'nobody-here.example.com');
	await p.locator('[data-testid=guest-list] [role=alert]').waitFor({ timeout: 20000 });
	check(
		'an unknown handle is refused in words',
		/wasn|weren/.test(await text(p, '[data-testid=guest-list] [role=alert]')),
		await text(p, '[data-testid=guest-list] [role=alert]')
	);
	await addGuest(p, P.alice.handle);
	await sleep(1500);
	check(
		'she cannot add herself',
		/host/.test(await text(p, '[data-testid=guest-list] [role=alert]'))
	);
	const m = await members();
	check(
		'PDS has bob, dana and carol on the list',
		[C.bob.did, C.dana.did, C.carol.did].every((d) => m.includes(d)),
		`${m.length}`
	);
	await shot(p, '04-guests');
});

await step('6. bob opens the link, signs in, allows it, sees the event', async () => {
	const p = (pages.bob = await pageFor('bob'));
	await open(p);
	await p.getByRole('button', { name: /^sign in$/i }).click({ timeout: 30000 });
	await signInForm(p, P.bob);
	await settle(p);
	check(
		'back on the event address',
		new URL(p.url()).pathname === EVENT_PATH,
		new URL(p.url()).pathname
	);
	await p.locator('[data-testid=grant-notice]').waitFor({ timeout: 30000 });
	await shot(p, '05-guest-ask');
	await allow(p, /allow atmo to open/i, P.bob);
	await p.getByRole('heading', { name: NAME }).first().waitFor({ timeout: 30000 });
	check(
		'he lands on the event, with no step before it',
		(await p.getByRole('button', { name: /^open this event$/i }).count()) === 0
	);
	const again = await open(p);
	check(
		'and not asked again',
		again === 200 && !(await text(p, 'main')).includes('Open this event')
	);
	check(
		'tells him to answer',
		/Answer to let the host know/.test(await text(p, '[data-testid=private-note]'))
	);
	check('no guest list for a guest', (await p.locator('[data-testid=guest-list]').count()) === 0);
	check('no edit button for a guest', (await p.getByRole('link', { name: /edit/i }).count()) === 0);
	check('nothing in his repo yet', (await ownRsvp('bob')) === null);
	await shot(p, '06-event-guest');
});

await step('7. bob says going, and the host sees his answer', async () => {
	const p = pages.bob;
	check('his answer is in his own repo in the space', await answer(p, /^going$/i, 'bob', 'going'));
	// The pop-up would open once the page has its answer back, so wait for the page to say so.
	await p.getByText("You're Going", { exact: true }).first().waitFor({ timeout: 20000 });
	check(
		'no pop-up asks him to share it',
		(await p.getByText("You're going!", { exact: true }).count()) === 0
	);
	check('0 RSVPs in his public repo', (await publicCount('bob', RSVP)) === 0);
	const a = pages.alice;
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	await guestRow(a, 'bob').waitFor({ timeout: 20000 });
	check('alice sees he is going', /\bGoing\b/.test(await guestRow(a, 'bob').innerText()));
	check('alice sees him going, by handle', await inAttendees(a, 'going', P.bob.handle));
	await shot(a, '07-host-after-going');
	await p.reload({ waitUntil: 'load' });
	await settle(p);
	await sleep(500);
	const note = await text(p, '[data-testid=private-note]');
	check(
		'bob still sees his answer after a reload',
		!/Answer to let the host know/.test(note),
		note
	);
});

await step('8. dana on another PDS answers interested', async () => {
	const p = (pages.dana = await pageFor('dana'));
	await signIn(p, P.dana);
	await open(p);
	await allow(p, /allow atmo to open/i, P.dana);
	await p.getByRole('heading', { name: NAME }).first().waitFor({ timeout: 30000 });
	check('her answer is in her own repo', await answer(p, /^interested$/i, 'dana', 'interested'));
	const a = pages.alice;
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	await guestRow(a, 'dana').waitFor({ timeout: 20000 });
	check(
		'alice sees she is interested',
		/\bInterested\b/.test(await guestRow(a, 'dana').innerText())
	);
});

await step('9. mallory, not invited, gets what a made-up address gets', async () => {
	const p = (pages.mallory = await pageFor('mallory'));
	await signIn(p, P.mallory);
	await open(p);
	await allow(p, /allow atmo to open/i, P.mallory);
	const madeUp = EVENT_PATH.replace(KEY, '3kzzzzzzzzzzz');
	const realStatus = await open(p);
	const real = await text(p, 'main');
	const made = await open(p, madeUp);
	const madeText = await text(p, 'main');
	check('both 404', realStatus === 404 && made === 404, `${realStatus} ${made}`);
	check('the same words', real === madeText, real.slice(0, 120));
	check('the name nowhere', !real.includes(NAME));
	await sameAsMadeUp('mallory', p, 'mallory, on the host’s PDS');
	check('not added', !(await members()).includes(C.mallory.did));
});

await step(
	'10. carol on a stock PDS is told her server cannot, and the rest of atmo works',
	async () => {
		const p = (pages.carol = await pageFor('carol'));
		await signIn(p, P.carol);
		await open(p);
		await allow(p, /allow atmo to open/i, P.carol);
		await sleep(800);
		await p.locator('[data-testid=grant-notice]').waitFor({ timeout: 30000 });
		check(
			'says her server cannot',
			/Your server did not give atmo permission/.test(await text(p, '[data-testid=grant-notice]'))
		);
		check('the name nowhere', !(await text(p, 'main')).includes(NAME));
		await shot(p, '08-stock-pds');
		const events = await p.goto(`${ATMO}/events`, { waitUntil: 'load', timeout: 60000 });
		check('/events still works', events?.status() === 200);
	}
);

await step('11. /private lists it for host and guest', async () => {
	await open(pages.alice, '/private');
	await pages.alice.locator('[data-testid=private-events]').waitFor({ timeout: 20000 });
	check(
		'alice: hosting',
		/You are hosting/.test(await text(pages.alice, '[data-testid=private-events]'))
	);
	check(
		'alice: no pointer to Settings, her beta is on',
		!/turn on private events in/i.test(await text(pages.alice, '[data-testid=beta-notice]'))
	);
	await shot(pages.alice, '09-private-host');
	await open(pages.bob, '/private');
	await pages.bob.locator('[data-testid=private-events]').waitFor({ timeout: 20000 });
	check(
		'bob: warned, and pointed at Settings to make his own',
		/will be lost[\s\S]*turn on private events in/i.test(
			await text(pages.bob, '[data-testid=beta-notice]')
		)
	);
	check(
		'bob: hosted by alice',
		(await text(pages.bob, '[data-testid=private-events]')).includes(P.alice.handle)
	);
	check(
		'the card opens the private page',
		(await pages.bob.locator(`[data-testid=private-events] a[href$="/private/${KEY}"]`).count()) > 0
	);
	check(
		'the page says the link is the invitation',
		/link is the invitation/i.test(await text(pages.bob, '[data-testid=link-is-invitation]'))
	);
	await listLoads(pages.mallory, 'mallory');
	check('mallory: not listed', !(await text(pages.mallory, 'main')).includes(NAME));
});

await step('12. alice removes dana, who loses it at once, then lets her back', async () => {
	const a = pages.alice;
	await open(a);
	check('she is on alice’s attendees before', await inAttendees(a, 'interested', P.dana.handle));
	await guestRow(a, 'dana')
		.getByRole('button', { name: /remove/i })
		.click();
	await guestRow(a, 'dana').waitFor({ state: 'detached', timeout: 20000 });
	const d = pages.dana;
	const status = await open(d);
	check('dana gets a 404 right after', status === 404, `${status}`);
	await sameAsMadeUp('dana', d, 'dana, removed, on another PDS');
	check('her record stays in her repo', (await ownRsvp('dana')) === 'interested');
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	check('she is off alice’s attendees', !(await inAttendees(a, 'interested', P.dana.handle)));
	check('and off alice’s page', !(await text(a, 'main')).includes(P.dana.handle));
	await addGuest(a, P.dana.handle);
	await guestRow(a, 'dana').waitFor({ timeout: 20000 });
	check(
		'back on the list, not answered yet',
		/hasn't answered/.test(await guestRow(a, 'dana').innerText())
	);
	const back = await open(d);
	check('dana reads it again', back === 200, `${back}`);
	check(
		'and is asked to answer again',
		/Answer to let the host know/.test(await text(d, '[data-testid=private-note]'))
	);
	check('her new answer lands', await answer(d, /^going$/i, 'dana', 'going'));
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	await guestRow(a, 'dana').waitFor({ timeout: 20000 });
	check(
		'alice sees her new answer, not the old one',
		/\bGoing\b/.test(await guestRow(a, 'dana').innerText())
	);
});

await step('13. alice edits the event, under a page open from before the edit', async () => {
	const a = pages.alice;
	await open(a);
	await addGuest(a, P.mallory.handle);
	await guestRow(a, 'mallory').waitFor({ timeout: 20000 });
	const stale = pages.mallory;
	await open(stale);
	await stale.getByRole('heading', { name: NAME }).first().waitFor({ timeout: 20000 });
	await a.getByRole('link', { name: /edit/i }).first().click({ timeout: 20000 });
	await a.waitForURL((u) => u.pathname.endsWith('/edit'), { timeout: 30000 });
	const name = a.locator('main [contenteditable=true]').first();
	await name.waitFor({ timeout: 30000 });
	await name.click();
	await a.keyboard.press('End');
	await a.keyboard.type(' at eight');
	await shot(a, '10-edit');
	await a
		.getByRole('button', { name: /^(save|update|publish)/i })
		.first()
		.click();
	await a.waitForURL((u) => !u.pathname.endsWith('/edit'), { timeout: 30000 });
	await a.waitForLoadState('load');
	await open(pages.bob);
	await pages.bob.getByRole('heading', { name: RENAMED }).first().waitFor({ timeout: 20000 });
	check('bob sees the new name', (await text(pages.bob, 'main')).includes(RENAMED));
	check('bob’s answer still stands', (await ownRsvp('bob')) === 'going');
	check('still 0 events in her public repo', (await publicCount('alice', EVENT)) === 0);
	await stale
		.getByRole('button', { name: /^going$/i })
		.first()
		.click({ timeout: 20000 });
	await stale.getByRole('heading', { name: RENAMED }).first().waitFor({ timeout: 20000 });
	check('the old page’s answer was refused', (await ownRsvp('mallory')) === null);
	check(
		'and she can answer without reloading',
		await answer(stale, /^going$/i, 'mallory', 'going')
	);
});

await step('14. a plain login in a second browser, then alice’s own page', async () => {
	const second = await pageFor('alice-2');
	await signIn(second, P.alice);
	await second.context().close();
	const a = pages.alice;
	const status = await open(a);
	check('her own event is not a 404', status === 200, `${status}`);
	await a.locator('[data-testid=grant-notice]').waitFor({ timeout: 20000 });
	await shot(a, '11-host-regrant');
	await allow(a, /allow atmo again/i, P.alice);
	await a.getByRole('heading', { name: RENAMED }).first().waitFor({ timeout: 30000 });
	check(
		'allowed again, she sees it and its guests',
		(await a.locator('[data-testid=guest-list]').count()) === 1
	);
	const b = await open(pages.bob);
	check('guests kept reading throughout', b === 200, `${b}`);
});

await step('14b. nothing reached the public network or atmo, and a public event did', async () => {
	const control = await C.mallory.write(EVENT, {
		name: PUBLIC_NAME,
		startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
		createdAt: new Date().toISOString(),
		mode: `${EVENT}#inperson`,
		status: `${EVENT}#scheduled`
	});
	const controlKey = control.uri.split('/').at(-1);

	// Not the space type's name: its lexicon is a public record on purpose.
	const needles = [NAME, RENAMED, KEY, SPACE];

	// What anyone can read from the public firehose: everything from the start of the network.
	const seen = await new Promise((resolve, reject) => {
		const ws = new WebSocket(`${JETSTREAM.replace(/^http/, 'ws')}/subscribe?cursor=0`);
		const found = { messages: 0, control: false, leaks: [], collections: {}, notControls: 0 };
		let quiet;
		const finish = () => {
			ws.close();
			resolve(found);
		};
		const giveUp = setTimeout(finish, 60000);
		ws.onerror = () => {
			clearTimeout(giveUp);
			clearTimeout(quiet);
			reject(new Error('jetstream connection failed'));
		};
		ws.onmessage = async (m) => {
			const raw = typeof m.data === 'string' ? m.data : await m.data.text();
			found.messages++;
			const message = JSON.parse(raw);
			const c = message.commit?.collection;
			if (c) found.collections[c] = (found.collections[c] ?? 0) + 1;
			// From the start of the network, so an earlier walk's control shows too. Those are mallory's.
			if (c === EVENT && message.did !== C.mallory.did) found.notControls++;
			if (raw.includes(PUBLIC_NAME)) found.control = true;
			for (const n of needles) if (raw.includes(n)) found.leaks.push(n);
			clearTimeout(quiet);
			quiet = setTimeout(() => (found.control ? (clearTimeout(giveUp), finish()) : null), 3000);
		};
	});
	log(`  jetstream: ${seen.messages} messages, ${JSON.stringify(seen.collections)}`);
	check('the public event is on the firehose, so the firehose works', seen.control);
	check('nothing of the private event is on it', seen.leaks.length === 0, seen.leaks.join(', '));
	check(
		'the only events on it are public controls',
		seen.notControls === 0,
		`${seen.notControls} of ${seen.collections[EVENT]}`
	);
	check('no RSVP on it at all', !seen.collections[RSVP], `${seen.collections[RSVP] ?? 0}`);

	// A repo's public export, raw, where a record's text sits as it was written.
	const exported = async (c) => {
		const r = await fetch(
			`${c.pds}/xrpc/com.atproto.sync.getRepo?${new URLSearchParams({ did: c.did })}`
		);
		if (!r.ok) throw new Error(`getRepo ${c.who}: ${r.status}`);
		return Buffer.from(await r.arrayBuffer());
	};
	check(
		'the public event is in its person’s exported repo',
		(await exported(C.mallory)).includes(PUBLIC_NAME)
	);
	for (const name of ['alice', 'bob', 'dana']) {
		const repo = await exported(C[name]);
		const leaks = needles.filter((needle) => repo.includes(needle));
		check(`nothing of it in ${name}’s exported repo`, leaks.length === 0, leaks.join(', '));
	}

	// atmo's own index, after real ingest. Each run reads the network's Jetstream for up to 20 s.
	let indexed = null;
	for (let i = 0; i < 6 && !indexed; i++) {
		await runCron();
		const r = await fetch(`${ATMO}/p/${C.mallory.handle}/e/${controlKey}/data.json`);
		if (r.ok) indexed = await r.json();
		else if (r.status !== 404) throw new Error(`atmo's event data: ${r.status}`);
	}
	check('atmo indexed the public event, so ingest works', indexed?.value?.name === PUBLIC_NAME);
	const hidden = await fetch(`${ATMO}/p/${C.alice.handle}/e/${KEY}/data.json`);
	check('atmo has no public copy of the private event', hidden.status === 404, `${hidden.status}`);
	const listing = await pages.mallory.request.get(`${ATMO}/events?filter=all`);
	const html = await listing.text();
	check('/events loaded', listing.status() === 200, `${listing.status()}`);
	check('/events shows the public event', html.includes(PUBLIC_NAME));
	check('/events has nothing of the private one', !html.includes(NAME) && !html.includes(KEY));
	const profile = await pages.mallory.request.get(`${ATMO}/p/${C.alice.handle}`);
	const publicPage = await profile.text();
	check('alice’s public page loaded', profile.status() === 200, `${profile.status()}`);
	check(
		'alice’s public page has nothing of it',
		!publicPage.includes(NAME) && !publicPage.includes(KEY)
	);
});

await step('15. alice cancels, and a guest gets the same page as anyone', async () => {
	const a = pages.alice;
	await open(a, `${EVENT_PATH}/edit`);
	await a
		.getByRole('button', { name: /^delete/i })
		.first()
		.click({ timeout: 20000 });
	const confirm = a.getByRole('button', { name: /^delete/i }).last();
	await confirm.click({ timeout: 10000 }).catch(() => {});
	await a.waitForURL((u) => u.pathname === '/private', { timeout: 30000 });
	await listLoads(a, 'alice');
	check('off her list', !(await text(a, 'main')).includes(NAME));
	const status = await open(pages.bob);
	check('bob gets a 404, not a 500', status === 404, `${status}`);
	check('in the same words', (await text(pages.bob, 'main')).includes(NOT_AVAILABLE));
	await shot(pages.bob, '12-guest-after-cancel');
	await sameAsMadeUp('bob', pages.bob, 'bob, after the cancel');
	check('his record stays in his repo', (await ownRsvp('bob')) === 'going');
	await listLoads(pages.bob, 'bob');
	check('off bob’s list', !(await text(pages.bob, 'main')).includes(NAME));
});

check('no uncaught error in any browser', pageErrors === 0, `${pageErrors}`);
await browser.close();
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nEVERY CHECK PASSED');
process.exit(failures ? 1 : 0);
