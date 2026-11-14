import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaceAccessDenied } from '#lib/spaces/server/space-credential.js';
import { HOST_SCOPE, GUEST_SCOPE } from '../scopes';
import { EVENT_COLLECTION, privateEventSpace, privateEventUri, RSVP_COLLECTION } from '../ids';
import type { CallerSession } from './caller';

const reader = { get: vi.fn(), writers: vi.fn() };
const credentialSpaceReader = vi.fn<(...args: unknown[]) => typeof reader>(() => reader);
vi.mock('#lib/spaces/server/space-read.js', () => ({
	credentialSpaceReader: (...args: unknown[]) => credentialSpaceReader(...args)
}));
const actorToDid = vi.fn();
vi.mock('#lib/actor.js', () => ({ actorToDid: (actor: string) => actorToDid(actor) }));
vi.mock('./people', () => ({
	verifiedHandle: async (did: string) => `${did.split(':').at(-1)}.example.com`
}));

const {
	addGuest,
	cancelPrivateEvent,
	myPrivateEvents,
	PrivateEventRefused,
	putPrivateRsvp,
	readPrivateEventPage,
	removeGuest,
	savePrivateEvent
} = await import('./events');

const HOST = 'did:plc:hosthosthosthosthosthost';
const GUEST = 'did:plc:guestguestguestguestgues';
const OTHER = 'did:plc:otherotherotherotherothe';
const RKEY = '3lzzzzzzzzzzz';
const SPACE = privateEventSpace(HOST, RKEY);
const EVENT_URI = privateEventUri(HOST, RKEY);
const RECORD = {
	$type: EVENT_COLLECTION,
	name: 'Dinner',
	createdAt: '2026-11-04T00:00:00.000Z',
	startsAt: '2026-11-07T00:00:00.000Z'
};

type Sent = { pathname: string; body?: Record<string, unknown>; query: URLSearchParams };

/** A session whose PDS answers `answers[nsid]`, or an empty 200. */
function caller(
	did: string,
	scope: string,
	answers: Record<string, (sent: Sent) => Response> = {}
): CallerSession & { sent: Sent[]; nsids(): string[] } {
	const sent: Sent[] = [];
	return {
		did,
		scope,
		sent,
		nsids: () => sent.map((s) => s.pathname.replace('/xrpc/', '')),
		handle: async (pathname, init) => {
			const url = new URL(pathname, 'https://pds.example.com');
			const one: Sent = {
				pathname: url.pathname,
				query: url.searchParams,
				...(init.body ? { body: JSON.parse(String(init.body)) } : {})
			};
			sent.push(one);
			const answer = answers[url.pathname.replace('/xrpc/', '')];
			return answer ? answer(one) : Response.json({});
		}
	};
}

const privateSpace = () =>
	Response.json({ policy: { $type: 'com.atproto.memberspace.policy', publishPolicy: true } });
const refuse = (status: number, error: string) => () => Response.json({ error }, { status });

function spaceRecord(repo: string, collection: string, value: Record<string, unknown>) {
	return {
		uri: `${SPACE}/${repo}/${collection}/${RKEY}`,
		cid: `cid-of-${repo}`,
		rkey: RKEY,
		value
	};
}
const rsvp = (status: string, uri = EVENT_URI) => ({
	$type: RSVP_COLLECTION,
	status: `${RSVP_COLLECTION}#${status}`,
	subject: { uri, cid: 'x' }
});

/** Reads in the space: the event, and each person's answer. */
function theSpaceHolds(answers: Record<string, ReturnType<typeof rsvp>>, event = RECORD) {
	reader.get.mockImplementation(
		async ({ repo, collection }: { repo: string; collection: string }) => {
			if (collection === EVENT_COLLECTION) return spaceRecord(HOST, EVENT_COLLECTION, event);
			const answer = answers[repo];
			return answer ? spaceRecord(repo, RSVP_COLLECTION, answer) : null;
		}
	);
}

beforeEach(() => {
	reader.get.mockReset();
	reader.writers.mockReset();
	actorToDid.mockReset();
	credentialSpaceReader.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('savePrivateEvent', () => {
	const input = { rkey: RKEY, record: { ...RECORD, media: [{ image: 'public-blob' }] } };

	it('makes a member-only space, then writes the event into it and never to the public repo', async () => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		const saved = await savePrivateEvent(host, input);

		expect(saved.uri).toBe(EVENT_URI);
		expect(host.nsids()).toEqual([
			'com.atproto.space.createSpace',
			'com.atproto.space.getSpace',
			'com.atproto.space.putRecord'
		]);
		expect(host.sent[0].body).toMatchObject({
			spaceType: 'rsvp.atmo.dev.space',
			skey: RKEY,
			policy: { $type: 'com.atproto.memberspace.policy' }
		});
		expect(host.sent[2].body).toMatchObject({
			space: SPACE,
			repo: HOST,
			collection: EVENT_COLLECTION,
			rkey: RKEY
		});
	});

	it("stores no image, since atmo can't show a private one yet", async () => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await savePrivateEvent(host, input);
		expect(host.sent[2].body?.record).not.toHaveProperty('media');
	});

	it('saves an edit into the space that is already there', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.createSpace': refuse(400, 'SpaceAlreadyExists'),
			'com.atproto.space.getSpace': privateSpace
		});
		await expect(savePrivateEvent(host, input)).resolves.toMatchObject({ uri: EVENT_URI });
	});

	it('writes nothing into a space anyone can read', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.getSpace': () =>
				Response.json({ policy: { $type: 'com.atproto.memberspace.policy', publicRead: true } })
		});
		await expect(savePrivateEvent(host, input)).rejects.toMatchObject({ reason: 'not-private' });
		expect(host.nsids()).not.toContain('com.atproto.space.putRecord');
	});

	it('writes nothing into a space another policy governs', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.getSpace': () =>
				Response.json({ policy: { $type: 'com.atproto.managedspace.policy' } })
		});
		await expect(savePrivateEvent(host, input)).rejects.toMatchObject({ reason: 'not-private' });
		expect(host.nsids()).not.toContain('com.atproto.space.putRecord');
	});

	it('refuses without the host grant, and without calling the PDS', async () => {
		const guest = caller(GUEST, GUEST_SCOPE);
		await expect(savePrivateEvent(guest, input)).rejects.toMatchObject({ reason: 'no-grant' });
		expect(guest.sent).toHaveLength(0);
	});

	it('refuses what is not an event, since a PDS does not validate a space record', async () => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await expect(savePrivateEvent(host, { rkey: RKEY, record: { name: 1 } })).rejects.toMatchObject(
			{ reason: 'not-an-event' }
		);
		expect(host.sent).toHaveLength(0);
	});

	it('never passes on what a PDS said when it refuses', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.createSpace': () =>
				Response.json({ error: 'Nope', message: 'secret detail' }, { status: 500 })
		});
		const refused = await savePrivateEvent(host, input).catch((e) => e);
		expect(refused).toBeInstanceOf(PrivateEventRefused);
		expect(refused.message).not.toContain('secret detail');
	});
});

describe('cancelPrivateEvent', () => {
	it('deletes the space of the caller’s own event', async () => {
		const host = caller(HOST, HOST_SCOPE);
		await cancelPrivateEvent(host, RKEY);
		expect(host.sent[0]).toMatchObject({
			pathname: '/xrpc/com.atproto.space.deleteSpace',
			body: { space: SPACE }
		});
	});
});

describe('putPrivateRsvp', () => {
	const answer = { rkey: RKEY, status: 'going' as const, cid: `cid-of-${HOST}` };

	it('writes to the guest’s own repo in the space, under the event’s key', async () => {
		theSpaceHolds({});
		const guest = caller(GUEST, GUEST_SCOPE);
		await putPrivateRsvp(guest, HOST, answer);
		expect(guest.nsids()).toEqual(['com.atproto.space.putRecord']);
		expect(guest.sent[0].body).toMatchObject({
			space: SPACE,
			repo: GUEST,
			collection: RSVP_COLLECTION,
			rkey: RKEY,
			record: {
				status: `${RSVP_COLLECTION}#going`,
				subject: { uri: EVENT_URI, cid: `cid-of-${HOST}` }
			}
		});
	});

	it('refuses an answer to a version the page no longer shows', async () => {
		theSpaceHolds({});
		const guest = caller(GUEST, GUEST_SCOPE);
		await expect(putPrivateRsvp(guest, HOST, { ...answer, cid: 'old' })).rejects.toMatchObject({
			reason: 'changed'
		});
		expect(guest.sent).toHaveLength(0);
	});

	it('refuses someone the space turns away, and writes nothing', async () => {
		reader.get.mockRejectedValue(new SpaceAccessDenied(SPACE, '400 SpaceNotFound'));
		const stranger = caller(OTHER, GUEST_SCOPE);
		await expect(putPrivateRsvp(stranger, HOST, answer)).rejects.toMatchObject({
			reason: 'no-event'
		});
		expect(stranger.sent).toHaveLength(0);
	});

	it('refuses without a grant, and without reading', async () => {
		const stock = caller(OTHER, 'atproto');
		await expect(putPrivateRsvp(stock, HOST, answer)).rejects.toMatchObject({ reason: 'no-grant' });
		expect(reader.get).not.toHaveBeenCalled();
	});

	it('lets a host answer their own event with the host grant alone', async () => {
		theSpaceHolds({});
		const host = caller(HOST, HOST_SCOPE);
		await expect(putPrivateRsvp(host, HOST, answer)).resolves.toBeUndefined();
	});
});

describe('readPrivateEventPage', () => {
	it('reads with credentials held for this request only', async () => {
		theSpaceHolds({});
		reader.writers.mockResolvedValue([]);
		const guest = caller(GUEST, GUEST_SCOPE);
		await readPrivateEventPage(guest, HOST, RKEY);
		await readPrivateEventPage(guest, HOST, RKEY);
		expect(credentialSpaceReader).toHaveBeenCalledTimes(2);
	});

	it.each([
		['refused', new SpaceAccessDenied(SPACE, '400 SpaceNotFound')],
		['cancelled', new SpaceAccessDenied(SPACE, '400 SpaceDeleted')]
	])('reads as nothing there when %s', async (_name, denial) => {
		reader.get.mockRejectedValue(denial);
		await expect(readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY)).resolves.toBeNull();
	});

	it('does not pass an outage off as nothing there', async () => {
		reader.get.mockRejectedValue(new Error('500'));
		await expect(readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY)).rejects.toThrow();
	});

	it.each([
		['a mode that is not a string', { mode: 7 }],
		['a name that is not a string', { name: 7 }],
		['a start that is not a date', { startsAt: 'soon' }],
		['no start', { startsAt: undefined }]
	])(
		'treats a record with %s as no event, since a PDS does not validate one',
		async (_, broken) => {
			theSpaceHolds({}, { ...RECORD, ...broken } as typeof RECORD);
			expect(await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY)).toBeNull();
			expect(reader.writers).not.toHaveBeenCalled();
		}
	);

	it('keeps an event whose stored image is malformed, since the image is never shown', async () => {
		theSpaceHolds({}, { ...RECORD, media: 'not-media' } as unknown as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY);
		expect(page?.event.name).toBe(RECORD.name);
		expect(page?.event).not.toHaveProperty('media');
	});

	it('says the answers are unread when who wrote could not be read', async () => {
		theSpaceHolds({});
		reader.writers.mockRejectedValue(new Error('503'));
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () => Response.json({ members: [{ did: GUEST }] })
		});
		const page = await readPrivateEventPage(host, HOST, RKEY);
		expect(page?.answersUnread).toBe(true);
		expect(page?.guests).toMatchObject([{ did: GUEST, answer: null, answerUnread: true }]);
	});

	it('names the one answer it could not read, and keeps the others', async () => {
		theSpaceHolds({ [OTHER]: rsvp('going') });
		const fromSpace = reader.get.getMockImplementation()!;
		reader.get.mockImplementation(async (query: { repo: string; collection: string }) => {
			if (query.repo === GUEST && query.collection === RSVP_COLLECTION) throw new Error('503');
			return fromSpace(query);
		});
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () =>
				Response.json({ members: [{ did: GUEST }, { did: OTHER }] })
		});
		const page = await readPrivateEventPage(host, HOST, RKEY);
		expect(page?.answersUnread).toBe(true);
		expect(page?.attendees.going.map((a) => a.did)).toEqual([OTHER]);
		expect(page?.guests).toMatchObject([
			{ did: GUEST, answer: null, answerUnread: true },
			{ did: OTHER, answer: 'going', answerUnread: false }
		]);
	});

	it('does not call someone who has not answered unread', async () => {
		theSpaceHolds({});
		reader.writers.mockResolvedValue([]);
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () => Response.json({ members: [{ did: GUEST }] })
		});
		const page = await readPrivateEventPage(host, HOST, RKEY);
		expect(page?.answersUnread).toBe(false);
		expect(page?.guests).toMatchObject([{ did: GUEST, answer: null, answerUnread: false }]);
	});

	it('shows no image, which would hand a public CDN the host’s DID', async () => {
		theSpaceHolds({}, { ...RECORD, media: [{ image: 'x' }] } as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY);
		expect(page?.event).not.toHaveProperty('media');
	});

	it('splits answers, keeps "not going" off both lists, and finds the viewer’s own', async () => {
		theSpaceHolds({
			[HOST]: rsvp('going'),
			[GUEST]: rsvp('interested'),
			[OTHER]: rsvp('notgoing')
		});
		reader.writers.mockResolvedValue([HOST, GUEST, OTHER]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY);
		expect(page?.attendees.going.map((a) => a.did)).toEqual([HOST]);
		expect(page?.attendees.interested.map((a) => a.did)).toEqual([GUEST]);
		expect(page?.viewerStatus).toBe('interested');
	});

	it('counts no answer from someone the PDS no longer tracks, so they are asked again', async () => {
		theSpaceHolds({ [GUEST]: rsvp('going') });
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), HOST, RKEY);
		expect(page?.viewerStatus).toBeNull();
		expect(page?.attendees.goingCount).toBe(0);
	});

	it('ignores an answer that names another event', async () => {
		theSpaceHolds({ [GUEST]: rsvp('going', 'at://someone/else/entirely') });
		reader.writers.mockResolvedValue([GUEST]);
		const page = await readPrivateEventPage(caller(HOST, HOST_SCOPE), HOST, RKEY);
		expect(page?.attendees.goingCount).toBe(0);
	});

	it('tells the host who said no, though they are on neither attendee list', async () => {
		theSpaceHolds({ [GUEST]: rsvp('notgoing'), [OTHER]: rsvp('interested') });
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		const answers = {
			'com.atproto.memberspace.listMembers': () =>
				Response.json({ members: [{ did: GUEST }, { did: OTHER }] })
		};
		const page = await readPrivateEventPage(caller(HOST, HOST_SCOPE, answers), HOST, RKEY);
		expect(page?.guests?.map((g) => g.answer)).toEqual(['notgoing', 'interested']);
		expect(page?.attendees.goingCount).toBe(0);
		expect(page?.attendees.interestedCount).toBe(1);
	});

	it("gives the guest list to the host alone, with each guest's answer", async () => {
		theSpaceHolds({ [GUEST]: rsvp('going') });
		reader.writers.mockResolvedValue([HOST, GUEST]);
		const answers = {
			'com.atproto.memberspace.listMembers': () =>
				Response.json({ members: [{ did: GUEST }, { did: OTHER }] })
		};
		const host = await readPrivateEventPage(caller(HOST, HOST_SCOPE, answers), HOST, RKEY);
		expect(host?.guests).toEqual([
			{ did: GUEST, handle: expect.any(String), answer: 'going', answerUnread: false },
			{ did: OTHER, handle: expect.any(String), answer: null, answerUnread: false }
		]);

		const guest = caller(GUEST, GUEST_SCOPE, answers);
		const seen = await readPrivateEventPage(guest, HOST, RKEY);
		expect(seen?.guests).toBeNull();
		expect(guest.nsids()).not.toContain('com.atproto.memberspace.listMembers');
	});
});

describe('addGuest', () => {
	it('puts the person the handle names on the list, able to read and answer', async () => {
		actorToDid.mockResolvedValue(GUEST);
		const host = caller(HOST, HOST_SCOPE);
		await addGuest(host, { rkey: RKEY, handleOrDid: '@guest.example.com ' });
		expect(actorToDid).toHaveBeenCalledWith('guest.example.com');
		expect(host.sent[0]).toMatchObject({
			pathname: '/xrpc/com.atproto.memberspace.putMembers',
			body: { space: SPACE, members: [{ did: GUEST, read: true, write: true }] }
		});
	});

	it('refuses a handle that names no one', async () => {
		actorToDid.mockRejectedValue(new Error('not found'));
		const host = caller(HOST, HOST_SCOPE);
		await expect(addGuest(host, { rkey: RKEY, handleOrDid: 'no.one' })).rejects.toMatchObject({
			reason: 'no-such-person'
		});
		expect(host.sent).toHaveLength(0);
	});

	it('refuses the host themself', async () => {
		actorToDid.mockResolvedValue(HOST);
		await expect(
			addGuest(caller(HOST, HOST_SCOPE), { rkey: RKEY, handleOrDid: 'me.example.com' })
		).rejects.toMatchObject({ reason: 'own-event' });
	});

	it('acts only on the caller’s own event, whatever a page sends', async () => {
		actorToDid.mockResolvedValue(GUEST);
		const someone = caller(OTHER, HOST_SCOPE);
		await addGuest(someone, { rkey: RKEY, handleOrDid: 'guest.example.com' });
		expect(someone.sent[0].body?.space).toBe(privateEventSpace(OTHER, RKEY));
	});

	it('refuses a guest’s grant', async () => {
		const guest = caller(GUEST, GUEST_SCOPE);
		await expect(
			addGuest(guest, { rkey: RKEY, handleOrDid: 'guest.example.com' })
		).rejects.toMatchObject({ reason: 'no-grant' });
		expect(guest.sent).toHaveLength(0);
	});
});

describe('removeGuest', () => {
	it('takes them off the caller’s own event', async () => {
		const host = caller(HOST, HOST_SCOPE);
		await removeGuest(host, { rkey: RKEY, did: GUEST });
		expect(host.sent[0]).toMatchObject({
			pathname: '/xrpc/com.atproto.memberspace.removeMembers',
			body: { space: SPACE, dids: [GUEST] }
		});
	});
});

describe('myPrivateEvents', () => {
	const KEPT_OUT = privateEventSpace(OTHER, '3laaaaaaaaaaa');

	it('lists only what the person can still read, soonest first', async () => {
		const later = privateEventSpace(HOST, '3lbbbbbbbbbbb');
		reader.get.mockImplementation(async ({ space, rkey }: { space: string; rkey: string }) => {
			if (space === KEPT_OUT) throw new SpaceAccessDenied(space, '400 SpaceNotFound');
			const startsAt = space === later ? '2026-12-01T00:00:00.000Z' : RECORD.startsAt;
			return { ...spaceRecord(HOST, EVENT_COLLECTION, { ...RECORD, startsAt }), rkey };
		});
		const guest = caller(GUEST, GUEST_SCOPE, {
			'com.atproto.space.listSpaces': () =>
				Response.json({ spaces: [{ space: later }, { space: KEPT_OUT }, { space: SPACE }] })
		});
		const { events, incomplete } = await myPrivateEvents(guest);
		expect(events.map((e) => e.event.rkey)).toEqual([RKEY, '3lbbbbbbbbbbb']);
		expect(incomplete).toBe(false);
		expect(events[0]).toMatchObject({ hosting: false, href: expect.stringContaining('/private/') });
		expect(guest.sent[0].query.get('spaceType')).toBe('rsvp.atmo.dev.space');
		expect(guest.sent[0].query.has('spaceDid')).toBe(false);
	});

	it('asks only for their own spaces without a guest’s grant, which is all the PDS would give', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.listSpaces': () => Response.json({ spaces: [] })
		});
		await myPrivateEvents(host);
		expect(host.sent[0].query.get('spaceDid')).toBe(HOST);
	});

	it('says the list is incomplete when an event could not be read', async () => {
		const down = privateEventSpace(OTHER, '3laaaaaaaaaaa');
		reader.get.mockImplementation(async ({ space }: { space: string }) => {
			if (space === down) throw new Error('503');
			return spaceRecord(HOST, EVENT_COLLECTION, RECORD);
		});
		const guest = caller(GUEST, GUEST_SCOPE, {
			'com.atproto.space.listSpaces': () =>
				Response.json({ spaces: [{ space: down }, { space: SPACE }] })
		});
		const { events, incomplete } = await myPrivateEvents(guest);
		expect(events).toHaveLength(1);
		expect(incomplete).toBe(true);
	});

	it('says the list is incomplete at the page limit, rather than stopping there quietly', async () => {
		reader.get.mockResolvedValue(spaceRecord(HOST, EVENT_COLLECTION, RECORD));
		const guest = caller(GUEST, GUEST_SCOPE, {
			'com.atproto.space.listSpaces': () =>
				Response.json({ spaces: [{ space: SPACE }], cursor: 'more' })
		});
		const { incomplete } = await myPrivateEvents(guest);
		expect(guest.sent).toHaveLength(10);
		expect(incomplete).toBe(true);
	});
});

describe('a write the person’s own PDS refuses', () => {
	const refusing = { error: 'Nope', message: 'secret detail' };
	const refuses = (did: string, scope: string, nsid: string) =>
		caller(did, scope, { [nsid]: () => Response.json(refusing, { status: 500 }) });
	const host = (nsid: string) => refuses(HOST, HOST_SCOPE, nsid);
	const answer = { rkey: RKEY, status: 'going' as const, cid: `cid-of-${HOST}` };
	const writes: Record<string, (nsid: string) => Promise<unknown>> = {
		'com.atproto.space.deleteSpace': (nsid) => cancelPrivateEvent(host(nsid), RKEY),
		'com.atproto.space.putRecord': (nsid) =>
			putPrivateRsvp(refuses(GUEST, GUEST_SCOPE, nsid), HOST, answer),
		'com.atproto.memberspace.putMembers': (nsid) =>
			addGuest(host(nsid), { rkey: RKEY, handleOrDid: 'guest.example.com' }),
		'com.atproto.memberspace.removeMembers': (nsid) =>
			removeGuest(host(nsid), { rkey: RKEY, did: GUEST })
	};

	it.each(Object.entries(writes))(
		'%s is refused in our words, never the PDS’s',
		async (nsid, run) => {
			theSpaceHolds({});
			actorToDid.mockResolvedValue(GUEST);
			await expect(run(nsid)).rejects.toMatchObject({
				reason: 'refused',
				message: new PrivateEventRefused('refused').message
			});
		}
	);
});
