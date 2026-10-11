const DEFAULT_ATM_APPVIEW_URL = 'https://appview.atmosphere.money';
const ATM_EVENTS_URL = 'https://events.atmosphere.tickets';
const TICKETED_EVENT_COLLECTION = 'tickets.atmosphere.ticketedEvent';
const CANCELLED_EVENT_STATUS = 'community.lexicon.calendar.event#cancelled';
const CACHE_KEY_ORIGIN = 'https://ticket-discovery-cache.internal';
const LOOKUP_TIMEOUT_MS = 1_000;
const FOUND_FRESH_MS = 5 * 60_000;
// listPublicConfig has an additional 30 requests/minute/IP route budget on top
// of the AppView-wide limiter. Keep clean negatives fresh long enough that
// ordinary non-ticketed event traffic does not continuously spend that budget.
const NOT_FOUND_FRESH_MS = 5 * 60_000;
const UNAVAILABLE_FRESH_MS = 15_000;
const FOUND_RETAIN_MS = 15 * 60_000;
const NOT_FOUND_RETAIN_MS = 24 * 60 * 60_000;
const CACHE_STORAGE_MS = NOT_FOUND_RETAIN_MS;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const FAILURE_REPORT_INTERVAL_MS = 5 * 60_000;
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

export type TicketDiscoveryResult =
	| { state: 'found'; href: string }
	| { state: 'none' }
	| { state: 'unavailable' };

type CachedLookup = { v: 2; result: TicketDiscoveryResult; checkedAt: number };
type FailureOperation = 'lookup' | 'cache-read' | 'cache-write';
type InFlightLookup = {
	promise: Promise<TicketDiscoveryResult>;
	context: { staleFallback?: CachedLookup };
};

class TicketDiscoveryLookupError extends Error {
	constructor(
		message: string,
		readonly scope: 'event' | 'origin' = 'origin',
		readonly retryAfterMs = DEFAULT_RATE_LIMIT_BACKOFF_MS
	) {
		super(message);
	}
}

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
const inFlight = new Map<string, InFlightLookup>();
const appViewRetryNotBefore = new Map<string, number>();
const reportedFailureAt = new Map<FailureOperation, number>();

const defaultFailureReporter: TicketDiscoveryFailureReporter = (operation, error) => {
	const now = Date.now();
	const previous = reportedFailureAt.get(operation);
	if (previous !== undefined && now - previous < FAILURE_REPORT_INTERVAL_MS) return;
	reportedFailureAt.set(operation, now);
	console.warn(`[ticket-discovery] ${operation} failed: ${formatFailureReason(error)}`);
};

/**
 * Admission policy is configured separately from ticket discovery. Until the
 * ticketedEvent contract grows an organizer-authored policy field, atmo can opt
 * exact pilot events into ticket-required presentation through deployment
 * configuration. Discovery never enables that policy by itself; conversely, an
 * authoritative no-record result restores baseline RSVP behavior even for a
 * configured pilot event so viewers never reach a ticketless dead end.
 */
export function isTicketAdmissionRequired(
	eventUri: string,
	env: TicketDiscoveryEnv | undefined
): boolean {
	// The kill switch must restore baseline RSVP behavior, not leave a pinned
	// event enforcing a policy whose ticket action can no longer be discovered.
	if (env?.ATM_TICKET_DISCOVERY_ENABLED !== 'true') return false;
	return parseRequiredEventUris(env?.ATM_TICKET_REQUIRED_EVENT_URIS).has(eventUri);
}

/** Test seam for isolate-local discovery state. */
export function clearTicketDiscoveryCache(): void {
	memoryCache.clear();
	inFlight.clear();
	appViewRetryNotBefore.clear();
	reportedFailureAt.clear();
}

/**
 * Do not discover or advertise a ticket page after a known end boundary.
 * An omitted endsAt follows atmo's existing no-end event semantics and stays
 * discoverable; malformed public dates fail closed.
 */
export function shouldDiscoverProtocolTickets(
	event: { startsAt?: unknown; endsAt?: unknown; status?: unknown },
	now = Date.now()
): boolean {
	if (event.status === CANCELLED_EVENT_STATUS) return false;
	if (!isDatetime(event.startsAt) || !Number.isFinite(now)) return false;
	if (event.endsAt === undefined || event.endsAt === null) return true;
	return isDatetime(event.endsAt) && Date.parse(event.endsAt) > now;
}

/** Shared, fail-soft loader seam for normal and full-embed public pages. */
export async function getEventProtocolTicketDiscovery({
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
}): Promise<TicketDiscoveryResult> {
	if (env?.ATM_TICKET_DISCOVERY_ENABLED !== 'true') return { state: 'none' };
	if (!shouldDiscoverProtocolTickets(event, now())) return { state: 'none' };

	const appViewUrl = normalizeOrigin(env.ATM_TICKET_APPVIEW_URL ?? DEFAULT_ATM_APPVIEW_URL);
	if (!appViewUrl) {
		reportFailure(onFailure, 'lookup', new Error('ATM AppView URL is invalid'));
		return { state: 'unavailable' };
	}

	return getProtocolTicketDiscovery({
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
export async function getProtocolTicketDiscovery({
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
}): Promise<TicketDiscoveryResult> {
	const event = parseCalendarEventUri(eventUri);
	const normalizedAppViewUrl = normalizeOrigin(appViewUrl);
	if (!event) return { state: 'none' };
	if (!normalizedAppViewUrl) {
		reportFailure(onFailure, 'lookup', new Error('ATM AppView URL is invalid'));
		return { state: 'unavailable' };
	}

	const key = buildCacheKey(normalizedAppViewUrl, eventUri);
	const checkedAt = now();
	const expectedHref = buildTicketUrl(event.organizerDid, event.rkey);
	const cached = await readCachedLookup({ key, expectedHref, checkedAt, cache, onFailure });

	if (cached) {
		const age = Math.max(0, checkedAt - cached.checkedAt);
		const freshFor = getFreshDuration(cached.result);
		if (age <= freshFor) return cached.result;

		const retainFor = getRetainDuration(cached.result);
		if (retainFor > freshFor && age <= retainFor) {
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
				onFailure,
				staleFallback: cached
			});
			scheduleBackground(refresh, waitUntil, onFailure);
			return cached.result;
		}
	}

	return startLookup({
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
	onFailure,
	staleFallback
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
	staleFallback?: CachedLookup;
}): Promise<TicketDiscoveryResult> {
	const pending = inFlight.get(key);
	if (pending) {
		if (
			staleFallback &&
			(!pending.context.staleFallback ||
				staleFallback.checkedAt > pending.context.staleFallback.checkedAt)
		) {
			pending.context.staleFallback = staleFallback;
		}
		return pending.promise;
	}

	const context: InFlightLookup['context'] = { staleFallback };

	const lookup = (async (): Promise<TicketDiscoveryResult> => {
		const checkedAt = now();
		const retryAt = appViewRetryNotBefore.get(appViewUrl) ?? 0;
		if (retryAt > checkedAt) {
			// Merely observing an open breaker must never extend it. Return any
			// retained authoritative result, otherwise fail soft until the original
			// retry deadline passes.
			return context.staleFallback?.result ?? { state: 'unavailable' };
		}
		if (retryAt) appViewRetryNotBefore.delete(appViewUrl);

		try {
			const result = await fetchProtocolTicketDiscovery({
				eventUri,
				event,
				appViewUrl,
				fetcher,
				timeoutMs,
				now
			});
			cacheResult({ v: 2, result, checkedAt: now() });
			return result;
		} catch (error) {
			return handleUnavailable(error, checkedAt);
		}

		function handleUnavailable(error: unknown, checkedAt: number): TicketDiscoveryResult {
			reportFailure(onFailure, 'lookup', error);
			const failure =
				error instanceof TicketDiscoveryLookupError
					? error
					: new TicketDiscoveryLookupError(formatFailureReason(error));
			if (failure.scope === 'origin') {
				const retryAt = checkedAt + failure.retryAfterMs;
				appViewRetryNotBefore.set(
					appViewUrl,
					Math.max(appViewRetryNotBefore.get(appViewUrl) ?? 0, retryAt)
				);
			}
			if (context.staleFallback) return context.staleFallback.result;
			const result: TicketDiscoveryResult = { state: 'unavailable' };
			cacheResult({ v: 2, result, checkedAt });
			return result;
		}

		function cacheResult(entry: CachedLookup): void {
			remember(key, entry);
			scheduleBackground(
				writeCachedLookup(key, entry, cache, onFailure),
				waitUntil,
				onFailure,
				'cache-write'
			);
		}
	})().finally(() => inFlight.delete(key));

	inFlight.set(key, { promise: lookup, context });
	return lookup;
}

async function fetchProtocolTicketDiscovery({
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
}): Promise<TicketDiscoveryResult> {
	const query = new URL('/xrpc/tickets.atmosphere.listPublicConfig', appViewUrl);
	query.searchParams.set('organizer', event.organizerDid);
	query.searchParams.set('eventUri', eventUri);
	query.searchParams.set('collections', TICKETED_EVENT_COLLECTION);
	query.searchParams.set('limit', '100');

	const response = await fetcher(query, {
		headers: { accept: 'application/json' },
		redirect: 'error',
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (response.status === 429) {
		const delay = parseRetryAfter(response.headers.get('retry-after'), now());
		throw new TicketDiscoveryLookupError('ATM AppView returned 429', 'origin', delay);
	}
	if (!response.ok) {
		// Only validation failures caused by this exact query stay event-scoped.
		// Auth, routing, deployment, and other HTTP failures indicate that the
		// AppView origin itself is not currently usable and must share backoff.
		const scope = response.status === 400 || response.status === 422 ? 'event' : 'origin';
		throw new TicketDiscoveryLookupError(`ATM AppView returned ${response.status}`, scope);
	}

	let body: { records?: unknown };
	try {
		body = (await response.json()) as { records?: unknown };
	} catch {
		throw new TicketDiscoveryLookupError('ATM AppView returned invalid JSON');
	}
	if (!Array.isArray(body.records)) {
		throw new TicketDiscoveryLookupError('ATM AppView returned an invalid envelope');
	}
	if (body.records.length === 0) return { state: 'none' };

	const found = body.records.some((record) =>
		isActiveTicketedEvent(record, { eventUri, organizerDid: event.organizerDid })
	);
	if (found) return { state: 'found', href: buildTicketUrl(event.organizerDid, event.rkey) };

	// listPublicConfig normally filters archived records before returning them.
	// Treat an exact archived record as an authoritative negative if a compatible
	// AppView returns one anyway, while keeping malformed/mismatched envelopes
	// transient so they cannot poison a verified positive cache.
	const archived = body.records.some((record) =>
		isTicketedEventForEvent(record, { eventUri, organizerDid: event.organizerDid }, true)
	);
	if (archived) return { state: 'none' };
	throw new TicketDiscoveryLookupError(
		'ATM AppView returned no usable ticketedEvent record',
		'event'
	);
}

async function readCachedLookup({
	key,
	expectedHref,
	checkedAt,
	cache,
	onFailure
}: {
	key: string;
	expectedHref: string;
	checkedAt: number;
	cache?: TicketDiscoveryCache;
	onFailure: TicketDiscoveryFailureReporter;
}): Promise<CachedLookup | null> {
	const memory = memoryCache.get(key);
	if (memory && isFreshAt(memory, checkedAt)) {
		remember(key, memory);
		return memory;
	}
	if (!cache) return memory ?? null;

	try {
		const response = await cache.match(key);
		if (!response) return memory ?? null;
		const value = await response.json();
		if (!isCachedLookup(value, expectedHref)) throw new Error('invalid cached response');
		const resolved = !memory || value.checkedAt > memory.checkedAt ? value : memory;
		remember(key, resolved);
		return resolved;
	} catch (error) {
		reportFailure(onFailure, 'cache-read', error);
		return memory ?? null;
	}
}

function isFreshAt(entry: CachedLookup, checkedAt: number): boolean {
	return Math.max(0, checkedAt - entry.checkedAt) <= getFreshDuration(entry.result);
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
					'cache-control': `public, max-age=${Math.floor(CACHE_STORAGE_MS / 1_000)}`
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
	return isTicketedEventForEvent(value, expected, false);
}

function isTicketedEventForEvent(
	value: unknown,
	expected: { eventUri: string; organizerDid: string },
	archived: boolean
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
		record.archived === archived
	);
}

function remember(key: string, entry: CachedLookup): void {
	// Refresh insertion order so the bounded map behaves as LRU, not FIFO.
	if (memoryCache.has(key)) memoryCache.delete(key);
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
	// Keep the key namespace aligned with CachedLookup.v so deployments do not
	// parse an older envelope as corruption and emit avoidable cache warnings.
	const key = new URL('/v2', CACHE_KEY_ORIGIN);
	key.searchParams.set('appview', appViewUrl);
	key.searchParams.set('event', eventUri);
	return key.href;
}

function isCachedLookup(value: unknown, expectedHref: string): value is CachedLookup {
	if (!isObject(value)) return false;
	return (
		value.v === 2 &&
		Number.isFinite(value.checkedAt) &&
		isTicketDiscoveryResult(value.result, expectedHref)
	);
}

function isTicketDiscoveryResult(
	value: unknown,
	expectedHref: string
): value is TicketDiscoveryResult {
	if (!isObject(value) || typeof value.state !== 'string') return false;
	if (value.state === 'found') return value.href === expectedHref;
	return value.state === 'none' || value.state === 'unavailable';
}

function getFreshDuration(result: TicketDiscoveryResult): number {
	if (result.state === 'found') return FOUND_FRESH_MS;
	if (result.state === 'none') return NOT_FOUND_FRESH_MS;
	return UNAVAILABLE_FRESH_MS;
}

function getRetainDuration(result: TicketDiscoveryResult): number {
	if (result.state === 'found') return FOUND_RETAIN_MS;
	if (result.state === 'none') return NOT_FOUND_RETAIN_MS;
	return UNAVAILABLE_FRESH_MS;
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
	const eventKey = encodeURIComponent(rkey).replaceAll('%3A', ':');
	return `${ATM_EVENTS_URL}/p/${actor}/e/${eventKey}`;
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

function isDatetime(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
