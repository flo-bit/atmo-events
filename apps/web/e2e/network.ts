// What the e2e tests know about the local network (snowglobe.yml, app e2e), and how they act on
// it: make accounts and write records at its PDS, run atmo's cron, and walk a browser through
// sign-up and sign-in at the PDS.
import type { Browser, Page } from 'playwright';

/** atmo's dev server. Its loopback OAuth client returns here (DEV_PORT in src/lib/atproto/settings.ts). */
export const ATMO = 'http://127.0.0.1:5454';

export const EVENT = 'community.lexicon.calendar.event';
export const RSVP = 'community.lexicon.calendar.rsvp';
export const POST = 'app.bsky.feed.post';
export const STARTER_PACK = 'app.bsky.graph.starterpack';
export const LIST_ITEM = 'app.bsky.graph.listitem';

function required(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is not set. Run the e2e tests with pnpm test:e2e.`);
	return value;
}

export const PDS = required('E2E_PDS');
export const BOT_HANDLE = required('E2E_BOT_HANDLE');
/** The network's image CDN, which atmo's PUBLIC_CDN_URL names. */
export const CDN = required('E2E_CDN');
/** atmo's local database on this network, relative to apps/web (LOCAL_STATE_DIR in snowglobe.yml). */
export const ATMO_STATE_DIR = required('E2E_ATMO_STATE_DIR');

async function xrpc<T>(
	nsid: string,
	init: { params?: Record<string, string>; body?: unknown; token?: string } = {}
): Promise<T> {
	const url = new URL(`/xrpc/${nsid}`, PDS);
	for (const [key, value] of Object.entries(init.params ?? {})) url.searchParams.set(key, value);
	const response = await fetch(url, {
		method: init.body ? 'POST' : 'GET',
		headers: {
			...(init.body ? { 'content-type': 'application/json' } : {}),
			...(init.token ? { authorization: `Bearer ${init.token}` } : {})
		},
		body: init.body ? JSON.stringify(init.body) : undefined
	});
	if (!response.ok) throw new Error(`${nsid}: ${response.status}`);
	return response.json() as Promise<T>;
}

export interface RepoRecord<T = Record<string, unknown>> {
	uri: string;
	cid: string;
	value: T;
}

/** A collection in a repo on the PDS. */
export async function records<T = Record<string, unknown>>(repo: string, collection: string) {
	const { records } = await xrpc<{ records: RepoRecord<T>[] }>('com.atproto.repo.listRecords', {
		params: { repo, collection, limit: '100' }
	});
	return records;
}

/** A handle the PDS gives out, for a name (3 to 18 letters, digits or hyphens). */
export async function handleFor(name: string) {
	const { availableUserDomains } = await xrpc<{ availableUserDomains: string[] }>(
		'com.atproto.server.describeServer'
	);
	return `${name}${availableUserDomains[0]}`;
}

export interface Person {
	handle: string;
	password: string;
	did: string;
	token: string;
}

/** A new account on the PDS, made directly: someone who is already on the network. */
export async function createPerson(name: string): Promise<Person> {
	const handle = await handleFor(name);
	const password = crypto.randomUUID();
	const { did, accessJwt } = await xrpc<{ did: string; accessJwt: string }>(
		'com.atproto.server.createAccount',
		{ body: { handle, email: `${name}@example.com`, password } }
	);
	return { handle, password, did, token: accessJwt };
}

/** Writes a record to the person's repo without atmo. */
export async function createRecord(who: Person, collection: string, record: object) {
	return xrpc<{ uri: string; cid: string }>('com.atproto.repo.createRecord', {
		body: { repo: who.did, collection, record: { $type: collection, ...record } },
		token: who.token
	});
}

/** One run of atmo's cron, which takes new records from the network's Jetstream. */
export async function runCron(secret: string) {
	const response = await fetch(`${ATMO}/api/cron`, {
		method: 'POST',
		headers: { 'X-Cron-Secret': secret }
	});
	if (!response.ok) throw new Error(`atmo's cron: ${response.status}`);
}

/** An event as atmo has it, or undefined while atmo does not. */
export async function atmoEvent(actor: string, rkey: string) {
	const response = await fetch(`${ATMO}/p/${actor}/e/${rkey}/data.json`);
	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error(`atmo's event data: ${response.status}`);
	return (await response.json()) as {
		value?: { name?: string };
		rsvps?: { going?: { did: string }[] };
	};
}

export const rkeyOf = (uri: string) => uri.split('/').pop() ?? '';

const settle = (page: Page) => page.waitForLoadState('networkidle').catch(() => {});

async function leftAtmo(page: Page) {
	await page.waitForURL((url) => url.origin !== ATMO, { timeout: 30_000 });
	await settle(page);
}

/** The PDS's consent page, then back at atmo. */
async function authorize(page: Page) {
	await page.getByRole('button', { name: /^authorize$/i }).click();
	await page.waitForURL((url) => url.origin === ATMO, { timeout: 45_000 });
	await settle(page);
}

async function newBrowser(browser: Browser) {
	// The network's certificates come from its own authority, which Chromium does not know.
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const page = await context.newPage();
	await page.goto(ATMO, { waitUntil: 'networkidle' });
	await page
		.getByRole('button', { name: /^log in$/i })
		.first()
		.click();
	return page;
}

/** A fresh browser that makes a new account through atmo's Sign up, at the PDS. */
export async function signUp(browser: Browser, name: string) {
	const page = await newBrowser(browser);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /^sign up$/i })
		.click();
	await page.getByRole('button', { name: /^continue to sign up/i }).click();
	await leftAtmo(page);
	await page.locator('input[name=handle]').fill(name);
	await page.locator('button[type=submit]').click();
	await page.locator('input[name=email]').fill(`${name}@example.com`);
	await page.locator('input[name=password]').fill(crypto.randomUUID());
	await page.locator('button[type=submit]').click();
	await authorize(page);
	return { page, handle: await handleFor(name) };
}

/** A fresh browser, signed in to atmo through the person's PDS. */
export async function signIn(browser: Browser, who: Person) {
	const page = await newBrowser(browser);
	await page.locator('input[name=handle]').fill(who.handle);
	await page
		.getByRole('button', { name: /^log in/i })
		.last()
		.click();
	await page.getByRole('button', { name: /^continue to log in/i }).click();
	await leftAtmo(page);
	await page.locator('input[name=password]').fill(who.password);
	await page.locator('button[type=submit]').last().click();
	await page.locator('input[name=password]').waitFor({ state: 'detached', timeout: 45_000 });
	await authorize(page);
	return page;
}
