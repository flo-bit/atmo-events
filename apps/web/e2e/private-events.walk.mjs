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
const TYPE = 'rsvp.atmo.calendarSpace';
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
const shot = (page, name) =>
	page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
const pageFor = async (who) => {
	const ctx = await browser.newContext({
		ignoreHTTPSErrors: true,
		viewport: { width: 1100, height: 850 }
	});
	const page = await ctx.newPage();
	page.on('pageerror', (e) => log(`  [${who}] browser error: ${clean(e.message, 200)}`));
	return page;
};
const text = async (page, sel = 'body') =>
	clean(
		await page
			.locator(sel)
			.first()
			.innerText()
			.catch(() => '')
	);

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
		`stuck at the PDS for ${who.who}: ${page.url().split('?')[0]} ${await text(page)}`
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
async function allow(page, name, who) {
	await page.getByRole('button', { name }).click({ timeout: 30000 });
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
	return { ...who, did, call };
}
const C = {};
for (const [k, v] of Object.entries(P)) C[k] = await checker(v);

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
const NOT_AVAILABLE = "This event isn't available";
const members = async () =>
	(await C.alice.call('com.atproto.memberspace.listMembers', { space: SPACE })).data?.members?.map(
		(m) => m.did
	) ?? [];
const ownRsvp = async (name) => {
	const c = C[name];
	const r = await c.call('com.atproto.space.getRecord', {
		space: SPACE,
		repo: c.did,
		collection: RSVP,
		rkey: KEY
	});
	return r.status === 200 ? r.data.value.status.split('#')[1] : null;
};
const publicCount = async (name, collection) => {
	const c = C[name];
	const r = await fetch(
		`${c.pds}/xrpc/com.atproto.repo.listRecords?${new URLSearchParams({ repo: c.did, collection })}`
	);
	return (await r.json()).records?.length ?? 0;
};
// Under vite dev a click before hydration does nothing, so wait for the network to settle.
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const open = async (page, target = EVENT_PATH) => {
	const res = await page.goto(`${ATMO}${target}`, { waitUntil: 'load', timeout: 60000 });
	await settle(page);
	return res?.status();
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
	await p.getByLabel(/invited people only/i).check();
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
	const policy = await C.alice.call('com.atproto.space.getSpace', { space: SPACE });
	check('memberspace policy', policy.data?.policy?.$type === 'com.atproto.memberspace.policy');
	const blobs = await C.alice.call('com.atproto.sync.listBlobs', { did: C.alice.did });
	check(
		'no blob uploaded',
		(blobs.data?.cids?.length ?? 0) === 0,
		`${blobs.data?.cids?.length ?? '?'}`
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
	check('0 RSVPs in his public repo', (await publicCount('bob', RSVP)) === 0);
	const a = pages.alice;
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	await guestRow(a, 'bob').waitFor({ timeout: 20000 });
	check('alice sees he is going', /\bGoing\b/.test(await guestRow(a, 'bob').innerText()));
	check(
		'alice sees him going, by handle',
		(await a.locator('main').innerText()).includes(P.bob.handle)
	);
	await shot(a, '07-host-after-going');
	await p.reload({ waitUntil: 'load' });
	await settle(p);
	await sleep(500);
	check(
		'bob still sees his answer after a reload',
		!/Answer to let the host know/.test(await text(p, '[data-testid=private-note]'))
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
	await sleep(800);
	const real = await text(p, 'main');
	const realStatus = await open(p);
	const made = await open(p, EVENT_PATH.replace(KEY, '3kzzzzzzzzzzz'));
	const madeText = await text(p, 'main');
	check('both 404', realStatus === 404 && made === 404, `${realStatus} ${made}`);
	check('the same words', real === madeText, real.slice(0, 120));
	check('the name nowhere', !real.includes(NAME));
	const none = await C.alice.call('com.atproto.memberspace.listMembers', { space: SPACE });
	check('not added', !(none.data?.members ?? []).some((m) => m.did === C.mallory.did));
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
	await shot(pages.alice, '09-private-host');
	await open(pages.bob, '/private');
	await pages.bob.locator('[data-testid=private-events]').waitFor({ timeout: 20000 });
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
	await open(pages.mallory, '/private');
	check('mallory: not listed', !(await text(pages.mallory, 'main')).includes(NAME));
});

await step('12. alice removes dana, who loses it at once, then lets her back', async () => {
	const a = pages.alice;
	await open(a);
	await guestRow(a, 'dana')
		.getByRole('button', { name: /remove/i })
		.click();
	await guestRow(a, 'dana').waitFor({ state: 'detached', timeout: 20000 });
	const d = pages.dana;
	const status = await open(d);
	check('dana gets a 404 right after', status === 404, `${status}`);
	check('her record stays in her repo', (await ownRsvp('dana')) === 'interested');
	const going = await text(a, 'main');
	await a.reload({ waitUntil: 'load' });
	await settle(a);
	check(
		'she is off alice’s attendees',
		!(await text(a, 'main')).includes(P.dana.handle),
		going.length ? '' : ''
	);
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

await step('13. alice edits the event', async () => {
	const a = pages.alice;
	await open(a);
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
	check('bob sees the new name', true);
	check('bob’s answer still stands', (await ownRsvp('bob')) === 'going');
	check('still 0 events in her public repo', (await publicCount('alice', EVENT)) === 0);
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
	check('off her list', !(await text(a, 'main')).includes(NAME));
	const status = await open(pages.bob);
	check('bob gets a 404, not a 500', status === 404, `${status}`);
	check('in the same words', (await text(pages.bob, 'main')).includes(NOT_AVAILABLE));
	await shot(pages.bob, '12-guest-after-cancel');
	check('his record stays in his repo', true);
	await open(pages.bob, '/private');
	check('off bob’s list', !(await text(pages.bob, 'main')).includes(NAME));
});

await browser.close();
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nEVERY CHECK PASSED');
process.exit(failures ? 1 : 0);
