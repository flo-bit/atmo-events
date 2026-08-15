import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearTicketDiscoveryCache,
	getEventProtocolTicketLink,
	getProtocolTicketLink,
	isTicketAdmissionRequired,
	shouldDiscoverProtocolTickets,
	type TicketDiscoveryCache
} from './atmosphere-tickets';

const organizerDid = 'did:plc:retm6aeqattyxp7bhmyyv7gk';
const rkey = '3mrdbziccpcah';
const eventUri = `at://${organizerDid}/community.lexicon.calendar.event/${rkey}`;
const ticketUrl = `https://events.atmosphere.tickets/p/${organizerDid}/e/${rkey}`;
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
			expect(url.searchParams.get('limit')).toBe('5');
			expect(init?.redirect).toBe('error');
			return jsonResponse({ records: [ticketRecord] });
		});

		await expect(getProtocolTicketLink({ eventUri, fetcher })).resolves.toBe(ticketUrl);
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

		await expect(getProtocolTicketLink({ eventUri, fetcher, onFailure })).resolves.toBeNull();
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('treats an exact archived record as a clean negative', async () => {
		const fetcher = vi.fn<typeof fetch>(async () =>
			jsonResponse({ records: [{ ...ticketRecord, archived: true }] })
		);
		const onFailure = vi.fn();

		await expect(getProtocolTicketLink({ eventUri, fetcher, onFailure })).resolves.toBeNull();
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('does not cache a malformed nonempty response as a clean miss', async () => {
		const cache = createCache();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [{ ...ticketRecord, archived: undefined }] }))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, onFailure })
		).resolves.toBeNull();
		await expect(getProtocolTicketLink({ eventUri, fetcher, cache, onFailure })).resolves.toBe(
			ticketUrl
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(cache.entries.size).toBe(1);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('fails soft for AppView failures without caching them', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }));

		const onFailure = vi.fn();
		await expect(getProtocolTicketLink({ eventUri, fetcher, onFailure })).resolves.toBeNull();
		await expect(getProtocolTicketLink({ eventUri, fetcher, onFailure })).resolves.toBe(ticketUrl);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('briefly caches a validated answer and coalesces concurrent requests', async () => {
		let resolveResponse: ((value: Response) => void) | undefined;
		const fetcher = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (resolveResponse = resolve))
		);

		const first = getProtocolTicketLink({ eventUri, fetcher });
		const second = getProtocolTicketLink({ eventUri, fetcher });
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledOnce();
		resolveResponse?.(jsonResponse({ records: [ticketRecord] }));

		await expect(first).resolves.toBe(ticketUrl);
		await expect(second).resolves.toBe(ticketUrl);
		await expect(getProtocolTicketLink({ eventUri, fetcher })).resolves.toBe(ticketUrl);
		expect(fetcher).toHaveBeenCalledOnce();
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
			getProtocolTicketLink({
				eventUri,
				fetcher,
				cache,
				waitUntil: (promise) => background.push(promise)
			})
		).resolves.toBe(ticketUrl);

		expect(cache.put).toHaveBeenCalledOnce();
		expect(background).toHaveLength(1);
		finishPut?.();
		await Promise.all(background);
	});

	it('shares fresh negative results through the edge cache', async () => {
		const cache = createCache();
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [] }));
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');

		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toBeNull();
		clearTicketDiscoveryCache();
		checkedAt += 30_000;
		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toBeNull();

		expect(fetcher).toHaveBeenCalledOnce();
		expect(cache.entries.size).toBe(1);
		expect([...cache.entries.values()][0].headers.get('cache-control')).toBe(
			'public, max-age=86400'
		);
	});

	it('serves a stale verified CTA while a transient refresh fails', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503));

		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toBe(ticketUrl);
		clearTicketDiscoveryCache();
		checkedAt += 10 * 60_000;
		const background: Promise<unknown>[] = [];
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketLink({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => background.push(promise),
				onFailure
			})
		).resolves.toBe(ticketUrl);
		await Promise.all(background);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).toHaveBeenCalledWith('lookup', expect.any(Error));
	});

	it('replaces a stale verified CTA after an authoritative archived response', async () => {
		const cache = createCache();
		let checkedAt = Date.parse('2026-08-13T12:00:00Z');
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ records: [ticketRecord] }))
			.mockResolvedValueOnce(jsonResponse({ records: [{ ...ticketRecord, archived: true }] }));

		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, now: () => checkedAt })
		).resolves.toBe(ticketUrl);
		clearTicketDiscoveryCache();
		checkedAt += 10 * 60_000;
		const background: Promise<unknown>[] = [];
		const onFailure = vi.fn();

		await expect(
			getProtocolTicketLink({
				eventUri,
				fetcher,
				cache,
				now: () => checkedAt,
				waitUntil: (promise) => background.push(promise),
				onFailure
			})
		).resolves.toBe(ticketUrl);
		await Promise.all(background);
		await expect(
			getProtocolTicketLink({ eventUri, fetcher, cache, now: () => checkedAt, onFailure })
		).resolves.toBeNull();

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('backs off the AppView origin after a rate-limit response', async () => {
		const fetcher = vi.fn<typeof fetch>(
			async () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } })
		);
		const onFailure = vi.fn();
		const now = () => Date.parse('2026-08-13T12:00:00Z');

		await expect(getProtocolTicketLink({ eventUri, fetcher, now, onFailure })).resolves.toBeNull();
		await expect(getProtocolTicketLink({ eventUri, fetcher, now, onFailure })).resolves.toBeNull();

		expect(fetcher).toHaveBeenCalledOnce();
		expect(onFailure).toHaveBeenCalledTimes(2);
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

		await expect(getProtocolTicketLink({ eventUri, fetcher, cache })).resolves.toBe(ticketUrl);
		await expect(
			getProtocolTicketLink({
				eventUri,
				appViewUrl: 'https://staging-appview.example',
				fetcher,
				cache
			})
		).resolves.toBe(ticketUrl);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0][0]).not.toContain(eventUri);
		expect(warn.mock.calls[0][0]).not.toContain('\n');

		wallClock += 5 * 60_000;
		await expect(
			getProtocolTicketLink({
				eventUri,
				appViewUrl: 'https://third-appview.example',
				fetcher,
				cache
			})
		).resolves.toBe(ticketUrl);

		expect(warn).toHaveBeenCalledTimes(4);
		dateNow.mockRestore();
		warn.mockRestore();
	});

	it('does not query when discovery is disabled or the event is over', async () => {
		const fetcher = vi.fn<typeof fetch>();
		const futureEvent = { startsAt: '2026-08-13T13:00:00Z' };

		await expect(
			getEventProtocolTicketLink({ eventUri, event: futureEvent, env: {}, fetcher })
		).resolves.toBeNull();
		await expect(
			getEventProtocolTicketLink({
				eventUri,
				event: { ...futureEvent, endsAt: '2026-08-13T13:30:00Z' },
				env: { ATM_TICKET_DISCOVERY_ENABLED: 'true' },
				fetcher,
				now: () => Date.parse('2026-08-13T14:00:00Z')
			})
		).resolves.toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('reports an invalid configured AppView origin without querying it', async () => {
		const fetcher = vi.fn<typeof fetch>();
		const onFailure = vi.fn();

		await expect(
			getEventProtocolTicketLink({
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
		).resolves.toBeNull();

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
				getProtocolTicketLink({ eventUri: malformedEventUri, fetcher })
			).resolves.toBeNull();
		}
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('encodes non-PLC DID path data without changing the canonical origin', async () => {
		const webDid = 'did:web:example.com%3A8443:user:alice';
		const webEventUri = `at://${webDid}/community.lexicon.calendar.event/event`;
		const record = {
			...ticketRecord,
			organizer: webDid,
			rkey: 'ticket-config',
			uri: `at://${webDid}/tickets.atmosphere.ticketedEvent/ticket-config`,
			event: { ...ticketRecord.event, uri: webEventUri }
		};
		const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ records: [record] }));

		await expect(getProtocolTicketLink({ eventUri: webEventUri, fetcher })).resolves.toBe(
			'https://events.atmosphere.tickets/p/did:web:example.com%253A8443:user:alice/e/event'
		);
	});
});
