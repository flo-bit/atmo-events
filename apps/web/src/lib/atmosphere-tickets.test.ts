import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearTicketDiscoveryCache,
	getEventProtocolTicketDiscovery,
	getProtocolTicketDiscovery,
	isTicketAdmissionRequired,
	shouldDiscoverProtocolTickets,
	type TicketDiscoveryCache
} from './atmosphere-tickets';

const organizerDid = 'did:plc:retm6aeqattyxp7bhmyyv7gk';
const rkey = '3mrdbziccpcah';
const eventUri = `at://${organizerDid}/community.lexicon.calendar.event/${rkey}`;
const ticketUrl = `https://events.atmosphere.tickets/p/${organizerDid}/e/${rkey}`;
const found = { state: 'found', href: ticketUrl } as const;
const none = { state: 'none' } as const;
const unavailable = { state: 'unavailable' } as const;
const ticketRecord = {
	uri: `at://${organizerDid}/tickets.atmosphere.ticketedEvent/7ioqjkny73m2b`,
	cid: 'bafyreihxgppppppppppppppppppppppppppppppppppppppppppp',
	organizer: organizerDid,
	collection: 'tickets.atmosphere.ticketedEvent',
	rkey: '7ioqjkny73m2b',
	archived: false,
	event: {
		uri: eventUri,
		cid: 'bafyreicxgppppppppppppppppppppppppppppppppppppppppppp'
	}
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function createCache(): TicketDiscoveryCache & { entries: Map<string, Response> } {
	const entries = new Map<string, Response>();
	return {
		entries,
		async match(key) {
			return entries.get(key)?.clone();
		},
		async put(key, response) {
			entries.set(key, response.clone());
		}
	};
}

beforeEach(() => clearTicketDiscoveryCache());

describe('ticket-required pilot policy', () => {
	it('matches only exact configured event URIs', () => {
		const env = {
			ATM_TICKET_DISCOVERY_ENABLED: 'true',
			ATM_TICKET_REQUIRED_EVENT_URIS: `${eventUri}, at://did:plc:other/community.lexicon.calendar.event/other`
		};

		expect(isTicketAdmissionRequired(eventUri, env)).toBe(true);
		expect(
			isTicketAdmissionRequired(
				`at://${organizerDid}/community.lexicon.calendar.event/different`,
				env
			)
		).toBe(false);
	});

	it('disables pilot admission policy with the discovery kill switch', () => {
		expect(
			isTicketAdmissionRequired(eventUri, {
				ATM_TICKET_DISCOVERY_ENABLED: 'false',
				ATM_TICKET_REQUIRED_EVENT_URIS: eventUri
			})
		).toBe(false);
		expect(isTicketAdmissionRequired(eventUri, { ATM_TICKET_REQUIRED_EVENT_URIS: eventUri })).toBe(
			false
		);
	});

	it('does not infer admission policy from discovery configuration', () => {
		expect(
			isTicketAdmissionRequired(eventUri, {
				ATM_TICKET_DISCOVERY_ENABLED: 'true',
				ATM_TICKET_APPVIEW_URL: 'https://appview.atmosphere.money'
			})
		).toBe(false);
	});
});

describe('ticket discovery timing', () => {
	const now = Date.parse('2026-08-13T12:00:00Z');

	it('uses a known event end and keeps a no-end event discoverable', () => {
		expect(
			shouldDiscoverProtocolTickets(
				{ startsAt: '2026-08-13T11:00:00Z', endsAt: '2026-08-13T13:00:00Z' },
				now
			)
		).toBe(true);
		expect(shouldDiscoverProtocolTickets({ startsAt: '2026-08-13T11:00:00Z' }, now)).toBe(true);
	});

	it.each([
		{ startsAt: 'not-a-date' },
		{ startsAt: undefined },
		{ startsAt: '2026-08-13T13:00:00Z', endsAt: 'not-a-date' },
		{
			startsAt: '2026-08-13T13:00:00Z',
			status: 'community.lexicon.calendar.event#cancelled'
		}
	])('fails closed for invalid or cancelled events: %o', (event) => {
		expect(shouldDiscoverProtocolTickets(event, now)).toBe(false);
	});
});

describe('protocol ticket lookup', () => {
	it('queries the public AppView and returns the canonical hosted event page', async () => {
		const fetcher = vi.fn<typeof fetch>(async (input, init) => {
			const url = new URL(input.toString());
			expect(url.pathname).toBe('/xrpc/tickets.atmosphere.listPublicConfig');
			expect(url.searchParams.get('organizer')).toBe(organizerDid);
			expect(url.searchParams.get('eventUri')).toBe(eventUri);
			expect(url.searchParams.get('collections')).toBe('tickets.atmosphere.ticketedEvent');
			expect(url.searchParams.get('limit')).toBe('100');
			expect(init?.redirect).toBe('error');
			return jsonResponse({ records: [ticketRecord] });
		});

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher })).resolves.toEqual(found);
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it.each([
		['wrong organizer', { organizer: 'did:plc:attacker' }],
		['wrong event', { event: { ...ticketRecord.event, uri: `${eventUri}-other` } }],
		['missing archived flag', { archived: undefined }],
		['wrong collection', { collection: 'tickets.atmosphere.ticketType' }],
		['malformed CID', { cid: 'not-a-cid' }]
	])('rejects a %s record', async (_name, override) => {
		const fetcher = vi.fn<typeof fetch>(async () =>
			jsonResponse({ records: [{ ...ticketRecord, ...override }] })
		);
		const onFailure = vi.fn();

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher, onFailure })).resolves.toEqual(
			unavailable
		);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('treats an exact archived record as a clean negative', async () => {
		const fetcher = vi.fn<typeof fetch>(async () =>
			jsonResponse({ records: [{ ...ticketRecord, archived: true }] })
		);
		const onFailure = vi.fn();

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher, onFailure })).resolves.toEqual(
			none
		);
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('caches a malformed nonempty response as unavailable, never as a clean miss', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [{ ...ticketRecord, archived: undefined }] }))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				onFailure,
				now: () => checkedAt
			})
		).resolves.toEqual(unavailable);
		clearTicketDiscoveryCache();
		checkedAt += 31_000;
		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				onFailure,
				now: () => checkedAt
			})
		).resolves.toEqual(found);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(cache.entries.size).toBe(1);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('caches AppView failures briefly as unavailable', async () => {
		const cache = createCache();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));

		const onFailure = vi.fn();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure, now: () => checkedAt })
		).resolves.toEqual(unavailable);
		clearTicketDiscoveryCache();
		checkedAt += 10_000;
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure, now: () => checkedAt })
		).resolves.toEqual(unavailable);
		expect(fetcher).toHaveBeenCalledOnce();
		clearTicketDiscoveryCache();
		checkedAt += 31_000;
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure, now: () => checkedAt })
		).resolves.toEqual(found);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('opens the origin breaker for systemic failures across distinct events', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'busy' }, 503));
		const onFailure = vi.fn();
		const now = () => Date.parse('2026-08-13T12:00:00Z');
		const otherEventUri = `at://${organizerDid}/community.lexicon.calendar.event/other-event`;

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, onFailure, now })
		).resolves.toEqual(unavailable);
		await expect(
			getProtocolTicketDiscovery({ eventUri: otherEventUri, fetcher, onFailure, now })
		).resolves.toEqual(unavailable);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(onFailure).toHaveBeenCalledOnce();
	});

	it('does not extend an open breaker and resumes fetching after its deadline', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));
		const onFailure = vi.fn();
		const base = Date.parse('2026-08-13T12:00:00Z');
		let checkedAt = base;

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, onFailure, now: () => checkedAt })
		).resolves.toEqual(unavailable);
		checkedAt = base + 16_000;
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, onFailure, now: () => checkedAt })
		).resolves.toEqual(unavailable);
		checkedAt = base + 31_000;
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, onFailure, now: () => checkedAt })
		).resolves.toEqual(found);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledOnce();
	});

	it.each([400, 422])('keeps query-validation HTTP %i scoped to one event', async (status) => {
		const otherRkey = 'other-event';
		const otherEventUri = `at://${organizerDid}/community.lexicon.calendar.event/${otherRkey}`;
		const otherRecord = {
			...ticketRecord,
			rkey: 'other-ticket-config',
			uri: `at://${organizerDid}/tickets.atmosphere.ticketedEvent/other-ticket-config`,
			event: { ...ticketRecord.event, uri: otherEventUri }
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'invalid request' }, status))
			.mockResolvedValueOnce(jsonResponse({ records: [otherRecord] }));

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher })).resolves.toEqual(unavailable);
		await expect(getProtocolTicketDiscovery({ eventUri: otherEventUri, fetcher })).resolves.toEqual(
			{
				state: 'found',
				href: `https://events.atmosphere.tickets/p/${organizerDid}/e/${otherRkey}`
			}
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it.each([401, 403, 404, 405, 410])(
		'backs off origin-level HTTP %i responses across events',
		async (status) => {
			const otherEventUri = `at://${organizerDid}/community.lexicon.calendar.event/other-event`;
			const fetcher = vi.fn<typeof fetch>(async () =>
				jsonResponse({ error: 'unavailable' }, status)
			);

			await expect(getProtocolTicketDiscovery({ eventUri, fetcher })).resolves.toEqual(unavailable);
			await expect(
				getProtocolTicketDiscovery({ eventUri: otherEventUri, fetcher })
			).resolves.toEqual(unavailable);

			expect(fetcher).toHaveBeenCalledOnce();
		}
	);

	it('keeps an event-specific malformed record from blocking unrelated events', async () => {
		const otherRkey = 'other-event';
		const otherEventUri = `at://${organizerDid}/community.lexicon.calendar.event/${otherRkey}`;
		const otherRecord = {
			...ticketRecord,
			rkey: 'other-ticket-config',
			uri: `at://${organizerDid}/tickets.atmosphere.ticketedEvent/other-ticket-config`,
			event: { ...ticketRecord.event, uri: otherEventUri }
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [{ ...ticketRecord, archived: undefined }] }))
			.mockResolvedValueOnce(jsonResponse({ records: [otherRecord] }));

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher })).resolves.toEqual(unavailable);
		await expect(getProtocolTicketDiscovery({ eventUri: otherEventUri, fetcher })).resolves.toEqual(
			{
				state: 'found',
				href: `https://events.atmosphere.tickets/p/${organizerDid}/e/${otherRkey}`
			}
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('briefly caches a validated answer and coalesces concurrent requests', async () => {
		let resolveResponse: ((value: Response) => void) | undefined;
		const fetcher = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (resolveResponse = resolve))
		);

		const first = getProtocolTicketDiscovery({ eventUri, fetcher });
		const second = getProtocolTicketDiscovery({ eventUri, fetcher });
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledOnce();
		resolveResponse?.(jsonResponse({ records: [ticketRecord] }));

		await expect(first).resolves.toEqual(found);
		await expect(second).resolves.toEqual(found);
		await expect(getProtocolTicketDiscovery({ eventUri, fetcher })).resolves.toEqual(found);
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('preserves a stale fallback that joins an in-flight cold lookup', async () => {
		const cache = createCache();
		const base = Date.parse('2026-08-13T12:00:00Z');
		let checkedAt = base;
		const writes: Promise<unknown>[] = [];

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher: vi.fn<typeof fetch>(async () => jsonResponse({ records: [ticketRecord] })),
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => writes.push(promise)
			})
		).resolves.toEqual(found);
		await Promise.all(writes);
		clearTicketDiscoveryCache();
		checkedAt = base + 10 * 60_000;

		let finishLookup: ((response: Response) => void) | undefined;
		const fetcher = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (finishLookup = resolve))
		);
		const coldLookup = getProtocolTicketDiscovery({
			eventUri,
			fetcher,
			now: () => checkedAt
		});
		await Promise.resolve();
		const refreshes: Promise<unknown>[] = [];

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => refreshes.push(promise)
			})
		).resolves.toEqual(found);
		expect(fetcher).toHaveBeenCalledOnce();

		finishLookup?.(jsonResponse({ error: 'busy' }, 503));
		await expect(coldLookup).resolves.toEqual(found);
		await Promise.all(refreshes);

		const stored = await [...cache.entries.values()][0].clone().json();
		expect(stored).toMatchObject({ v: 2, result: found });
	});

	it('does not delay the page response while writing the edge cache', async () => {
		let finishPut: (() => void) | undefined;
		const cache: TicketDiscoveryCache = {
			match: vi.fn(async () => undefined),
			put: vi.fn(() => new Promise<void>((resolve) => (finishPut = resolve)))
		};
		const background: Promise<unknown>[] = [];
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [ticketRecord] }));

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				waitUntil: (promise) => background.push(promise)
			})
		).resolves.toEqual(found);

		expect(cache.put).toHaveBeenCalledOnce();
		expect(background).toHaveLength(1);
		finishPut?.();
		await Promise.all(background);
	});

	it('shares and revalidates negative results within the route-specific request budget', async () => {
		const cache = createCache();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [] }))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(none);
		clearTicketDiscoveryCache();
		checkedAt += 2 * 60_000;
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(none);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(cache.entries.size).toBe(1);
		expect(new URL([...cache.entries.keys()][0]).pathname).toBe('/v2');
		expect([...cache.entries.values()][0].headers.get('cache-control')).toBe(
			'public, max-age=86400'
		);

		checkedAt += 4 * 60_000;
		const background: Promise<unknown>[] = [];
		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => background.push(promise)
			})
		).resolves.toEqual(none);
		await Promise.all(background);
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(found);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('checks the shared edge cache before refreshing stale isolate memory', async () => {
		const cache = createCache();
		const base = Date.parse('2026-08-13T12:00:00Z');
		const writes: Promise<unknown>[] = [];

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher: vi.fn<typeof fetch>(async () => jsonResponse({ records: [] })),
				cache,
				now: () => base,
				waitUntil: (promise) => writes.push(promise)
			})
		).resolves.toEqual(none);
		await Promise.all(writes);

		const key = [...cache.entries.keys()][0];
		cache.entries.set(key, jsonResponse({ v: 2, result: found, checkedAt: base + 5 * 60_000 }));
		const fetcher = vi.fn<typeof fetch>();

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				now: () => base + 6 * 60_000
			})
		).resolves.toEqual(found);

		expect(fetcher).not.toHaveBeenCalled();
	});

	it('ignores the previous cache namespace without reporting corruption', async () => {
		const cache = createCache();
		const oldKey = new URL('/v1', 'https://ticket-discovery-cache.internal');
		oldKey.searchParams.set('appview', 'https://appview.atmosphere.money');
		oldKey.searchParams.set('event', eventUri);
		cache.entries.set(
			oldKey.href,
			jsonResponse({ v: 1, href: ticketUrl, checkedAt: Date.parse('2026-08-13T12:00:00Z') })
		);
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [] }));
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure })
		).resolves.toEqual(none);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(onFailure).not.toHaveBeenCalled();
		expect([...cache.entries.keys()].some((key) => new URL(key).pathname === '/v2')).toBe(true);
	});

	it('rejects an edge-cache destination that does not match the event', async () => {
		const cache = createCache();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ records: [] }));
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure })
		).resolves.toEqual(found);
		const key = [...cache.entries.keys()][0];
		cache.entries.set(
			key,
			jsonResponse({
				v: 2,
				result: { state: 'found', href: 'https://attacker.example/tickets' },
				checkedAt: Date.now()
			})
		);
		clearTicketDiscoveryCache();

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, onFailure })
		).resolves.toEqual(none);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledWith('cache-read', expect.any(Error));
	});

	it('serves a stale verified CTA while a transient refresh fails', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503));

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(found);
		clearTicketDiscoveryCache();
		checkedAt += 10 * 60_000;
		const background: Promise<unknown>[] = [];
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => background.push(promise),
				onFailure
			})
		).resolves.toEqual(found);
		await Promise.all(background);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('stops serving a stale verified CTA after the bounded grace period', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503));

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(found);
		clearTicketDiscoveryCache();
		checkedAt += 16 * 60_000;

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(unavailable);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('replaces a stale verified CTA after an authoritative archived response', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ records: [{ ...ticketRecord, archived: true }] }));

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toEqual(found);
		clearTicketDiscoveryCache();
		checkedAt += 10 * 60_000;
		const background: Promise<unknown>[] = [];
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => background.push(promise),
				onFailure
			})
		).resolves.toEqual(found);
		await Promise.all(background);
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, cache, now: () => checkedAt, onFailure })
		).resolves.toEqual(none);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('backs off the AppView origin after a rate-limit response', async () => {
		const fetcher = vi.fn<typeof fetch>(
			async () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } })
		);
		const onFailure = vi.fn();
		const now = () => Date.parse('2026-08-13T12:00:00Z');

		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, now, onFailure })
		).resolves.toEqual(unavailable);
		await expect(
			getProtocolTicketDiscovery({ eventUri, fetcher, now, onFailure })
		).resolves.toEqual(unavailable);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(onFailure).toHaveBeenCalledOnce();
	});

	it('rate-limits cache diagnostics without hiding a sustained outage', async () => {
		const cache: TicketDiscoveryCache = {
			match: vi.fn(async () => {
				throw new Error('read rejected\nwith stack-like noise');
			}),
			put: vi.fn(async () => {
				throw new Error('write rejected');
			})
		};
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [ticketRecord] }));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const dateNow = vi.spyOn(Date, 'now');
		let wallClock = Date.parse('2026-08-13T12:00:00Z');
		dateNow.mockImplementation(() => wallClock);

		await expect(getProtocolTicketDiscovery({ eventUri, fetcher, cache })).resolves.toEqual(found);
		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				appViewUrl: 'https://staging-appview.example',
				fetcher,
				cache
			})
		).resolves.toEqual(found);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0][0]).not.toContain(eventUri);
		expect(warn.mock.calls[0][0]).not.toContain('\n');

		wallClock += 5 * 60_000;
		await expect(
			getProtocolTicketDiscovery({
				eventUri,
				appViewUrl: 'https://third-appview.example',
				fetcher,
				cache
			})
		).resolves.toEqual(found);

		expect(warn).toHaveBeenCalledTimes(4);
		dateNow.mockRestore();
		warn.mockRestore();
	});

	it('does not query when discovery is disabled or the event is over', async () => {
		const fetcher = vi.fn<typeof fetch>();
		const futureEvent = { startsAt: '2026-08-13T13:00:00Z' };

		await expect(
			getEventProtocolTicketDiscovery({ eventUri, event: futureEvent, env: {}, fetcher })
		).resolves.toEqual(none);
		await expect(
			getEventProtocolTicketDiscovery({
				eventUri,
				event: { ...futureEvent, endsAt: '2026-08-13T13:30:00Z' },
				env: { ATM_TICKET_DISCOVERY_ENABLED: 'true' },
				fetcher,
				now: () => Date.parse('2026-08-13T14:00:00Z')
			})
		).resolves.toEqual(none);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('reports an invalid configured AppView origin without querying it', async () => {
		const fetcher = vi.fn<typeof fetch>();
		const onFailure = vi.fn();

		await expect(
			getEventProtocolTicketDiscovery({
				eventUri,
				event: { startsAt: '2026-08-13T13:00:00Z' },
				env: {
					ATM_TICKET_DISCOVERY_ENABLED: 'true',
					ATM_TICKET_APPVIEW_URL: 'javascript:alert(1)'
				},
				fetcher,
				now: () => Date.parse('2026-08-13T12:00:00Z'),
				onFailure
			})
		).resolves.toEqual(unavailable);

		expect(fetcher).not.toHaveBeenCalled();
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('rejects malformed event DIDs before querying', async () => {
		const fetcher = vi.fn<typeof fetch>();
		for (const malformedEventUri of [
			'at://did:plc:abc@example/community.lexicon.calendar.event/event',
			'at://did:web:example.com%ZZ/community.lexicon.calendar.event/event'
		]) {
			await expect(
				getProtocolTicketDiscovery({ eventUri: malformedEventUri, fetcher })
			).resolves.toEqual(none);
		}
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('encodes non-PLC DID path data without changing the canonical origin', async () => {
		const webDid = 'did:web:example.com%3A8443:user:alice';
		const webEventUri = `at://${webDid}/community.lexicon.calendar.event/event:part`;
		const record = {
			...ticketRecord,
			organizer: webDid,
			rkey: 'ticket-config',
			uri: `at://${webDid}/tickets.atmosphere.ticketedEvent/ticket-config`,
			event: { ...ticketRecord.event, uri: webEventUri }
		};
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [record] }));

		await expect(getProtocolTicketDiscovery({ eventUri: webEventUri, fetcher })).resolves.toEqual({
			state: 'found',
			href: 'https://events.atmosphere.tickets/p/did:web:example.com%253A8443:user:alice/e/event:part'
		});
	});
});
