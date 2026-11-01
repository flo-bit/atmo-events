import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_COLLECTION, connectionCapability } from '#lib/meet/connection.js';

const mocks = vi.hoisted(() => ({
	can: vi.fn(),
	get: vi.fn(),
	post: vi.fn(),
	fetch: vi.fn(),
	actorToDid: vi.fn()
}));
vi.mock('#lib/actor.js', () => ({ actorToDid: mocks.actorToDid }));
vi.mock('#lib/atproto/server/oauth.js', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
vi.mock('#lib/server/bluesky-profile.js', () => ({
	getBlueskyProfile: vi.fn(async () => undefined)
}));
import { actions, load } from './+page.server';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const uri = `at://${alice}/${CONNECTION_COLLECTION}/3mtest`;
function event(subject: string = bob, signedIn = true, incomingUri?: string) {
	const body = new FormData();
	body.set('subject', subject);
	// These must not be trusted by the writer.
	body.set('repo', bob);
	body.set('createdAt', 'yesterday');
	if (incomingUri !== undefined) body.set('incomingUri', incomingUri);
	return {
		locals: {
			did: signedIn ? alice : null,
			client: signedIn ? { get: mocks.get, post: mocks.post } : null
		},
		url: new URL('https://atmo.rsvp/tools/meet'),
		fetch: mocks.fetch,
		request: new Request('https://atmo.rsvp/tools/meet', { method: 'POST', body })
	} as unknown as Parameters<NonNullable<typeof actions.default>>[0];
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.can.mockResolvedValue(true);
	mocks.actorToDid.mockImplementation(async (actor: string) =>
		actor.startsWith('did:') ? actor : bob
	);
	mocks.get.mockResolvedValue({ ok: true, data: { records: [] } });
	mocks.post.mockResolvedValue({ ok: true, data: { uri, cid: 'cid' } });
	mocks.fetch.mockImplementation(
		async () => new Response(JSON.stringify({ records: [], cursor: null }))
	);
});

describe('meeting writes', () => {
	it('requires authentication and opt-in create permission', async () => {
		expect(await actions.default!(event(bob, false))).toMatchObject({ status: 401 });
		mocks.can.mockResolvedValue(false);
		expect(await actions.default!(event())).toMatchObject({ status: 403 });
		expect(mocks.can).toHaveBeenCalledWith(connectionCapability);
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it.each([alice, '', 'https://evil.test', 'not-a-did'])(
		'rejects self/invalid subject %s',
		async (subject) => {
			expect(await actions.default!(event(subject))).toMatchObject({ status: 400 });
			expect(mocks.post).not.toHaveBeenCalled();
		}
	);
	it('writes only to the authenticated account, using the verified schema', async () => {
		expect(await actions.default!(event())).toMatchObject({
			saved: { uri, owner: alice, subject: bob },
			alreadyMet: false
		});
		expect(mocks.post).toHaveBeenCalledExactlyOnceWith('com.atproto.repo.createRecord', {
			input: {
				repo: alice,
				collection: CONNECTION_COLLECTION,
				record: {
					$type: CONNECTION_COLLECTION,
					subject: bob,
					createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
				}
			}
		});
	});
	it('uses the original record’s exact timestamp when confirming an older meeting', async () => {
		const incoming = `at://${bob}/${CONNECTION_COLLECTION}/3mold`;
		const createdAt = '2025-04-03T12:34:56.123Z';
		mocks.fetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					uri: incoming,
					value: {
						$type: CONNECTION_COLLECTION,
						subject: alice,
						createdAt
					}
				})
			)
		);
		expect(await actions.default!(event(bob, true, incoming))).toMatchObject({
			saved: { createdAt },
			alreadyMet: false
		});
		expect(mocks.post.mock.calls[0]![1].input.record.createdAt).toBe(createdAt);
		const requestUrl = new URL(String(mocks.fetch.mock.calls[0]![0]));
		expect(requestUrl.origin).toBe('https://slingshot.microcosm.blue');
		expect(requestUrl.searchParams.get('repo')).toBe(bob);
		expect(mocks.fetch.mock.calls[0]![1]).toMatchObject({
			redirect: 'manual',
			credentials: 'omit'
		});
	});
	it.each([
		`at://${alice}/${CONNECTION_COLLECTION}/3mold`,
		`at://${bob}/app.bsky.feed.post/3mold`,
		`https://evil.test/meeting`,
		`at://${bob}/${CONNECTION_COLLECTION}/../bad`
	])('rejects an unrelated source URI: %s', async (incoming) => {
		expect(await actions.default!(event(bob, true, incoming))).toMatchObject({ status: 400 });
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it.each([
		{ subject: bob, createdAt: '2025-04-03T12:34:56.123Z' },
		{ subject: alice, createdAt: 'not a date' },
		{ subject: alice, createdAt: undefined }
	])('does not replace an invalid original timestamp with today: %j', async (value) => {
		const incoming = `at://${bob}/${CONNECTION_COLLECTION}/3mold`;
		mocks.fetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ uri: incoming, value: { $type: CONNECTION_COLLECTION, ...value } })
			)
		);
		expect(await actions.default!(event(bob, true, incoming))).toMatchObject({ status: 502 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('does not save with today’s date if the original record is missing or unavailable', async () => {
		const incoming = `at://${bob}/${CONNECTION_COLLECTION}/3mold`;
		mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		expect(await actions.default!(event(bob, true, incoming))).toMatchObject({ status: 502 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('rejects a redirect when verifying the original meeting without saving', async () => {
		const incoming = `at://${bob}/${CONNECTION_COLLECTION}/3mold`;
		mocks.fetch.mockResolvedValueOnce(
			new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
		);
		expect(await actions.default!(event(bob, true, incoming))).toMatchObject({ status: 502 });
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		expect(mocks.fetch.mock.calls[0]![1].redirect).toBe('manual');
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('leaves an already-saved meeting date unchanged, without reading the incoming record', async () => {
		mocks.get.mockResolvedValueOnce({
			ok: true,
			data: {
				records: [
					{
						uri,
						value: {
							$type: CONNECTION_COLLECTION,
							subject: bob,
							createdAt: '2024-01-02T00:00:00Z'
						}
					}
				]
			}
		});
		expect(
			await actions.default!(event(bob, true, `at://${bob}/${CONNECTION_COLLECTION}/3mold`))
		).toMatchObject({ alreadyMet: true, saved: { createdAt: '2024-01-02T00:00:00Z' } });
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('paginates before deciding whether an encounter is already saved', async () => {
		mocks.get
			.mockResolvedValueOnce({ ok: true, data: { records: [], cursor: 'next' } })
			.mockResolvedValueOnce({
				ok: true,
				data: {
					records: [
						{
							uri,
							value: {
								$type: CONNECTION_COLLECTION,
								subject: bob,
								createdAt: '2026-10-31T12:00:00Z'
							}
						}
					]
				}
			});
		expect(await actions.default!(event())).toMatchObject({ alreadyMet: true });
		expect(mocks.get.mock.calls[1]![1].params.cursor).toBe('next');
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('does not write when history cannot be read', async () => {
		mocks.get.mockResolvedValue({ ok: false });
		expect(await actions.default!(event())).toMatchObject({ status: 502 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('does not claim success when the PDS rejects the write', async () => {
		mocks.post.mockResolvedValue({ ok: false });
		expect(await actions.default!(event())).toMatchObject({ status: 502 });
	});
});

describe('meeting page reads', () => {
	it('recovers incoming encounters through paginated backlinks without writing anything', async () => {
		mocks.fetch
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						records: [{ did: bob, collection: CONNECTION_COLLECTION, rkey: '3mtest' }],
						cursor: 'more'
					})
				)
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ records: [] })));
		const data = await load(event() as never);
		expect(data).toMatchObject({
			canMeet: true,
			incomingFailed: false,
			connections: [{ owner: bob, subject: alice }]
		});
		expect(String(mocks.fetch.mock.calls[1]![0])).toContain('cursor=more');
		for (const [, options] of mocks.fetch.mock.calls) {
			expect(options).toMatchObject({ redirect: 'manual', credentials: 'omit' });
		}
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('rejects backlink redirects without following them', async () => {
		mocks.fetch.mockResolvedValueOnce(
			new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
		);
		expect(await load(event() as never)).toMatchObject({ incomingFailed: true });
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		expect(mocks.fetch.mock.calls[0]![1].redirect).toBe('manual');
	});
	it('treats backlink outages as a recoverable warning', async () => {
		mocks.fetch.mockRejectedValue(new Error('offline'));
		expect(await load(event() as never)).toMatchObject({
			incomingFailed: true,
			outgoingFailed: false
		});
	});
	it('loads a scanned DID without requiring a Bluesky profile or creating a record', async () => {
		const input = event();
		input.url.searchParams.set('did', bob);
		expect(await load(input as never)).toMatchObject({ target: { did: bob, profile: null } });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('resolves handles in new meeting links to a DID, without writing', async () => {
		const input = event();
		input.url.searchParams.set('actor', '@Bob.Test');
		expect(await load(input as never)).toMatchObject({ target: { did: bob } });
		expect(mocks.actorToDid).toHaveBeenCalledWith('bob.test');
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('recognizes a handle that resolves to the signed-in account as a self-scan', async () => {
		mocks.actorToDid.mockResolvedValueOnce(alice);
		const input = event();
		input.url.searchParams.set('actor', 'alice.test');
		expect(await load(input as never)).toMatchObject({ selfScan: true, target: null });
	});
	it('reports unresolved handles without creating records', async () => {
		mocks.actorToDid.mockRejectedValueOnce(new Error('not found'));
		const input = event();
		input.url.searchParams.set('actor', 'missing.test');
		await expect(load(input as never)).rejects.toMatchObject({ status: 404 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('rejects malformed links and recognizes self-scans', async () => {
		const input = event();
		input.url.searchParams.set('did', alice);
		expect(await load(input as never)).toMatchObject({ selfScan: true, target: null });
		input.url.searchParams.set('did', 'bad');
		await expect(load(input as never)).rejects.toMatchObject({ status: 400 });
	});
});
