const DEFAULT_ATM_APPVIEW_URL = 'https://appview.atmosphere.money';
const ATM_EVENTS_URL = 'https://events.atmosphere.tickets';
const TICKETED_EVENT_COLLECTION = 'tickets.atmosphere.ticketedEvent';
const CANCELLED_EVENT_STATUS = 'community.lexicon.calendar.event#cancelled';
const CACHE_KEY_ORIGIN = 'https://ticket-discovery-cache.internal';
const LOOKUP_TIMEOUT_MS = 1_000;
const FOUND_FRESH_MS = 5 * 60_000;
const NOT_FOUND_FRESH_MS = 60_000;
const CACHE_RETAIN_MS = 24 * 60 * 60_000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const MAX_MEMORY_ENTRIES = 500;
const DID_PATTERN = /^did:[a-z0-9]+:(?:[a-zA-Z0-9._:-]|%[0-9a-fA-F]{2})+$/;

type PublicTicketConfigRecord = {
	uri?: unknown;
	cid?: unknown;
	organizer?: unknown;
	collection?: unknown;
	rkey?: unknown;
	archived?: unknown;
	event?: { uri?: unknown; cid?: unknown };
};

type CachedLookup = { v: 1; href: string | null; checkedAt: number };
type FailureOperation = 'lookup' | 'cache-read' | 'cache-write';

export type TicketDiscoveryEnv = {
	ATM_TICKET_DISCOVERY_ENABLED?: string;
	ATM_TICKET_APPVIEW_URL?: string;
	ATM_TICKET_REQUIRED_EVENT_URIS?: string;
};

export type TicketDiscoveryCache = {
	match(key: string): Promise<Response | undefined>;
	put(key: string, response: Response): Promise<void>;
};

export type TicketDiscoveryFailureReporter = (operation: FailureOperation, error: unknown) => void;

const memoryCache = new Map<string, CachedLookup>();
const inFlight = new Map<string, Promise<string | null>>();
const appViewRetryNotBefore = new Map<string, number>();
const reportedFailures = new Set<FailureOperation>();

const defaultFailureReporter: TicketDiscoveryFailureReporter = (operation, error) => {
	if (reportedFailures.has(operation)) return;
	reportedFailures.add(operation);
	console.warn(`[ticket-discovery] ${operation} failed: ${formatFailureReason(error)}`);
};

/**
 * Admission policy is deliberately independent from ticket discovery. Until
 * the ticketedEvent contract grows an organizer-authored policy field, atmo can
 * opt exact pilot events into ticket-required presentation through deployment
 * configuration. A ticketedEvent record alone never implies this policy.
 */
export function isTicketAdmissionRequired(
	eventUri: string,
	env: TicketDiscoveryEnv | undefined
): boolean {
	return parseRequiredEventUris(env?.ATM_TICKET_REQUIRED_EVENT_URIS).has(eventUri);
}

/** Test seam for isolate-local discovery state. */
export function clearTicketDiscoveryCache(): void {
	memoryCache.clear();
	inFlight.clear();
	appViewRetryNotBefore.clear();
	reportedFailures.clear();
}

/** Do not discover or advertise a ticket page after the event boundary. */
export function shouldDiscoverProtocolTickets(
	event: { startsAt?: unknown; endsAt?: unknown; status?: unknown },
	now = Date.now()
): boolean {
	if (event.status === CANCELLED_EVENT_STATUS) return false;
	const boundaryValue = event.endsAt ?? event.startsAt;
	if (typeof boundaryValue !== 'string') return false;
	const boundary = Date.parse(boundaryValue);
	return Number.isFinite(boundary) && boundary > now;
}

/** Shared, fail-soft loader seam for normal and full-embed public pages. */
export async function getEventProtocolTicketLink({
	eventUri,
	event,
	env,
	fetcher = fetch,
	now = Date.now,
	timeoutMs = LOOKUP_TIMEOUT_MS,
	cache = getDefaultCache(),
	waitUntil,
	onFailure = defaultFailureReporter
}: {
	eventUri: string;
	event: { startsAt?: unknown; endsAt?: unknown; status?: unknown };
	env: TicketDiscoveryEnv | undefined;
	fetcher?: typeof fetch;
	now?: () => number;
	timeoutMs?: number;
	cache?: TicketDiscoveryCache;
	waitUntil?: (promise: Promise<unknown>) => void;
	onFailure?: TicketDiscoveryFailureReporter;
}): Promise<string | null> {
	if (env?.ATM_TICKET_DISCOVERY_ENABLED !== 'true') return null;
	if (!shouldDiscoverProtocolTickets(event, now())) return null;

	const appViewUrl = normalizeOrigin(env.ATM_TICKET_APPVIEW_URL ?? DEFAULT_ATM_APPVIEW_URL);
	if (!appViewUrl) {
		reportFailure(onFailure, 'lookup', new Error('ATM AppView URL is invalid'));
		return null;
	}

	return getProtocolTicketLink({
		eventUri,
		appViewUrl,
		fetcher,
		now,
		timeoutMs,
		cache,
		waitUntil,
		onFailure
	});
}

/**
 * Resolve the canonical hosted page only after validating an organizer-owned
 * ticketedEvent backlink. A small edge cache prevents public event views from
 * becoming request-per-page AppView traffic. Stale entries are presentation
 * hints only; they never become admission policy.
 */
export async function getProtocolTicketLink({
	eventUri,
	appViewUrl = DEFAULT_ATM_APPVIEW_URL,
	fetcher = fetch,
	now = Date.now,
	timeoutMs = LOOKUP_TIMEOUT_MS,
	cache = getDefaultCache(),
	waitUntil,
	onFailure = defaultFailureReporter
}: {
	eventUri: string;
	appViewUrl?: string;
	fetcher?: typeof fetch;
	now?: () => number;
	timeoutMs?: number;
	cache?: TicketDiscoveryCache;
	waitUntil?: (promise: Promise<unknown>) => void;
	onFailure?: TicketDiscoveryFailureReporter;
}): Promise<string | null> {
	const event = parseCalendarEventUri(eventUri);
	const normalizedAppViewUrl = normalizeOrigin(appViewUrl);
	if (!event) return null;
	if (!normalizedAppViewUrl) {
		reportFailure(onFailure, 'lookup', new Error('ATM AppView URL is invalid'));
		return null;
	}

	const key = buildCacheKey(normalizedAppViewUrl, eventUri);
	const checkedAt = now();
	const expectedHref = buildTicketUrl(event.organizerDid, event.rkey);
	const cached = await readCachedLookup({ key, expectedHref, cache, onFailure });

	if (cached) {
		const age = Math.max(0, checkedAt - cached.checkedAt);
		const freshFor = cached.href ? FOUND_FRESH_MS : NOT_FOUND_FRESH_MS;
		if (age <= freshFor) return cached.href;

		if (age <= CACHE_RETAIN_MS) {
			const refresh = startLookup({
				key,
				eventUri,
				event,
				appViewUrl: normalizedAppViewUrl,
				fetcher,
				timeoutMs,
				now,
				cache,
				waitUntil,
				onFailure
			}).catch((error) => reportFailure(onFailure, 'lookup', error));
			scheduleBackground(refresh, waitUntil, onFailure);
			return cached.href;
		}
	}

	try {
		return await startLookup({
			key,
			eventUri,
			event,
			appViewUrl: normalizedAppViewUrl,
			fetcher,
			timeoutMs,
			now,
			cache,
			waitUntil,
			onFailure
		});
	} catch (error) {
		reportFailure(onFailure, 'lookup', error);
		return null;
	}
}

function startLookup({
	key,
	eventUri,
	event,
	appViewUrl,
	fetcher,
	timeoutMs,
	now,
	cache,
	waitUntil,
	onFailure
}: {
	key: string;
	eventUri: string;
	event: { organizerDid: string; rkey: string };
	appViewUrl: string;
	fetcher: typeof fetch;
	timeoutMs: number;
	now: () => number;
	cache?: TicketDiscoveryCache;
	waitUntil?: (promise: Promise<unknown>) => void;
	onFailure: TicketDiscoveryFailureReporter;
}): Promise<string | null> {
	const pending = inFlight.get(key);
	if (pending) return pending;

	const lookup = (async () => {
		const checkedAt = now();
		const retryAt = appViewRetryNotBefore.get(appViewUrl) ?? 0;
		if (retryAt > checkedAt) throw new Error('ATM AppView retry window is active');
		if (retryAt) appViewRetryNotBefore.delete(appViewUrl);

		const href = await fetchProtocolTicketLink({
			eventUri,
			event,
			appViewUrl,
			fetcher,
			timeoutMs,
			now
		});
		const entry: CachedLookup = { v: 1, href, checkedAt: now() };
		remember(key, entry);
		scheduleBackground(
			writeCachedLookup(key, entry, cache, onFailure),
			waitUntil,
			onFailure,
			'cache-write'
		);
		return href;
	})().finally(() => inFlight.delete(key));

	inFlight.set(key, lookup);
	return lookup;
}

async function fetchProtocolTicketLink({
	eventUri,
	event,
	appViewUrl,
	fetcher,
	timeoutMs,
	now
}: {
	eventUri: string;
	event: { organizerDid: string; rkey: string };
	appViewUrl: string;
	fetcher: typeof fetch;
	timeoutMs: number;
	now: () => number;
}): Promise<string | null> {
	const query = new URL('/xrpc/tickets.atmosphere.listPublicConfig', appViewUrl);
	query.searchParams.set('organizer', event.organizerDid);
	query.searchParams.set('eventUri', eventUri);
	query.searchParams.set('collections', TICKETED_EVENT_COLLECTION);
	query.searchParams.set('limit', '1');

	const response = await fetcher(query, {
		headers: { accept: 'application/json' },
		redirect: 'error',
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (response.status === 429) {
		const delay = parseRetryAfter(response.headers.get('retry-after'), now());
		const retryAt = now() + delay;
		appViewRetryNotBefore.set(
			appViewUrl,
			Math.max(appViewRetryNotBefore.get(appViewUrl) ?? 0, retryAt)
		);
	}
	if (!response.ok) throw new Error(`ATM AppView returned ${response.status}`);

	const body = (await response.json()) as { records?: unknown };
	if (!Array.isArray(body.records)) throw new Error('ATM AppView returned an invalid envelope');
	if (body.records.length === 0) return null;

	const found = body.records.some((record) =>
		isActiveTicketedEvent(record, { eventUri, organizerDid: event.organizerDid })
	);
	if (!found) throw new Error('ATM AppView returned no usable ticketedEvent record');
	return buildTicketUrl(event.organizerDid, event.rkey);
}

async function readCachedLookup({
	key,
	expectedHref,
	cache,
	onFailure
}: {
	key: string;
	expectedHref: string;
	cache?: TicketDiscoveryCache;
	onFailure: TicketDiscoveryFailureReporter;
}): Promise<CachedLookup | null> {
	const memory = memoryCache.get(key);
	if (memory) return memory;
	if (!cache) return null;

	try {
		const response = await cache.match(key);
		if (!response) return null;
		const value = await response.json();
		if (!isCachedLookup(value, expectedHref)) throw new Error('invalid cached response');
		remember(key, value);
		return value;
	} catch (error) {
		reportFailure(onFailure, 'cache-read', error);
		return null;
	}
}

async function writeCachedLookup(
	key: string,
	entry: CachedLookup,
	cache: TicketDiscoveryCache | undefined,
	onFailure: TicketDiscoveryFailureReporter
): Promise<void> {
	if (!cache) return;
	try {
		await cache.put(
			key,
			new Response(JSON.stringify(entry), {
				headers: {
					'content-type': 'application/json',
					'cache-control': `public, max-age=${Math.floor(CACHE_RETAIN_MS / 1_000)}`
				}
			})
		);
	} catch (error) {
		reportFailure(onFailure, 'cache-write', error);
	}
}

function isActiveTicketedEvent(
	value: unknown,
	expected: { eventUri: string; organizerDid: string }
): boolean {
	if (!isObject(value)) return false;
	const record = value as PublicTicketConfigRecord;
	// Treat the event AT-URI as the stable logical identity. Requiring the
	// strongRef CID to equal the latest calendar revision would make ticket
	// discovery disappear after an ordinary event edit until ATM republishes;
	// the CID still has to be structurally valid.
	return (
		record.collection === TICKETED_EVENT_COLLECTION &&
		record.organizer === expected.organizerDid &&
		typeof record.rkey === 'string' &&
		isRecordKey(record.rkey) &&
		record.uri === `at://${expected.organizerDid}/${TICKETED_EVENT_COLLECTION}/${record.rkey}` &&
		isCid(record.cid) &&
		record.event?.uri === expected.eventUri &&
		isCid(record.event?.cid) &&
		record.archived === false
	);
}

function remember(key: string, entry: CachedLookup): void {
	if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
		const oldest = memoryCache.keys().next().value;
		if (oldest !== undefined) memoryCache.delete(oldest);
	}
	memoryCache.set(key, entry);
}

function scheduleBackground(
	promise: Promise<unknown>,
	waitUntil: ((promise: Promise<unknown>) => void) | undefined,
	onFailure: TicketDiscoveryFailureReporter,
	operation: FailureOperation = 'lookup'
): void {
	if (!waitUntil) {
		void promise;
		return;
	}
	try {
		waitUntil(promise);
	} catch (error) {
		reportFailure(onFailure, operation, error);
		void promise;
	}
}

function reportFailure(
	reporter: TicketDiscoveryFailureReporter,
	operation: FailureOperation,
	error: unknown
): void {
	try {
		reporter(operation, error);
	} catch {
		// Diagnostics must never make ticket discovery fail closed harder.
	}
}

function formatFailureReason(error: unknown): string {
	const reason = error instanceof Error ? error.message : 'unknown error';
	return reason.replace(/\s+/gu, ' ').trim().slice(0, 160) || 'unknown error';
}

function parseRetryAfter(value: string | null, now: number): number {
	if (value) {
		const seconds = Number(value);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return Math.min(seconds * 1_000, MAX_RATE_LIMIT_BACKOFF_MS);
		}
		const date = Date.parse(value);
		if (Number.isFinite(date) && date > now) {
			return Math.min(date - now, MAX_RATE_LIMIT_BACKOFF_MS);
		}
	}
	return DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

function buildCacheKey(appViewUrl: string, eventUri: string): string {
	const key = new URL('/v1', CACHE_KEY_ORIGIN);
	key.searchParams.set('appview', appViewUrl);
	key.searchParams.set('event', eventUri);
	return key.href;
}

function isCachedLookup(value: unknown, expectedHref: string): value is CachedLookup {
	if (!isObject(value)) return false;
	return (
		value.v === 1 &&
		Number.isFinite(value.checkedAt) &&
		(value.href === null || value.href === expectedHref)
	);
}

function getDefaultCache(): TicketDiscoveryCache | undefined {
	try {
		return (globalThis as unknown as { caches?: { default?: TicketDiscoveryCache } }).caches
			?.default;
	} catch {
		return undefined;
	}
}

function parseRequiredEventUris(value: string | undefined): Set<string> {
	return new Set(
		(value ?? '')
			.split(/[\s,]+/u)
			.map((uri) => uri.trim())
			.filter((uri) => parseCalendarEventUri(uri) !== null)
	);
}

function buildTicketUrl(organizerDid: string, rkey: string): string {
	const actor = encodeURIComponent(organizerDid).replaceAll('%3A', ':');
	return `${ATM_EVENTS_URL}/p/${actor}/e/${encodeURIComponent(rkey)}`;
}

function parseCalendarEventUri(uri: string): { organizerDid: string; rkey: string } | null {
	const match = uri.match(
		/^at:\/\/(did:[a-z0-9]+:[a-zA-Z0-9._:%-]+)\/community\.lexicon\.calendar\.event\/([a-zA-Z0-9._:~-]{1,512})$/
	);
	return match && DID_PATTERN.test(match[1]) ? { organizerDid: match[1], rkey: match[2] } : null;
}

function normalizeOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (url.username || url.password || url.search || url.hash) return null;
		if (url.pathname !== '/' && url.pathname !== '') return null;
		return url.origin;
	} catch {
		return null;
	}
}

function isRecordKey(value: string): boolean {
	return /^[a-zA-Z0-9._:~-]{1,512}$/.test(value);
}

function isCid(value: unknown): value is string {
	return typeof value === 'string' && /^b[a-z2-7]{20,200}$/.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
