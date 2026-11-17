import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventExternalImage } from '@atmo-dev/kit/events-data';
import { buildEventRecord, buildThumbnailMedia } from '@atmo-dev/kit/events/editor';
import { SpaceAccessDenied } from '#lib/spaces/server/space-credential.js';
import { HOST_SCOPE, GUEST_SCOPE } from '../scopes';
import {
	EVENT_COLLECTION,
	eventUri,
	privateEventSpace,
	RSVP_COLLECTION,
	singleEvent
} from '../ids';
import { MAX_PICTURE_BYTES } from '../pictures';
import type { CallerSession } from './caller';
import type { Refusal } from './events';

const reader = { get: vi.fn(), writers: vi.fn(), blob: vi.fn() };
const credentialSpaceReader = vi.fn<(...args: unknown[]) => typeof reader>(() => reader);
vi.mock('#lib/spaces/server/space-read.js', () => ({
	credentialSpaceReader: (...args: unknown[]) => credentialSpaceReader(...args)
}));
const actorToDid = vi.fn();
vi.mock('#lib/actor.js', () => ({ actorToDid: (actor: string) => actorToDid(actor) }));
const publicProfile =
	vi.fn<(did: string) => Promise<{ displayName?: string; avatar?: unknown } | null>>();
const publicProfiles = vi.fn(async (dids: string[]) => {
	const found = await Promise.all(
		dids.map(async (did) => [did, await publicProfile(did)] as const)
	);
	return new Map(found.filter(([, profile]) => profile !== null)) as Map<string, object>;
});
vi.mock('./people', () => ({
	verifiedHandle: async (did: string) => `${did.split(':').at(-1)}.example.com`,
	publicProfiles: (dids: string[]) => publicProfiles(dids)
}));

const {
	addGuest,
	cancelPrivateEvent,
	deletePrivateRsvp,
	myPrivateEvents,
	PrivateEventRefused,
	putPrivateRsvp,
	readPrivateEventForEdit,
	readPrivateEventPage,
	readPrivateEventPicture,
	removeGuest,
	savePrivateEvent
} = await import('./events');

const HOST = 'did:plc:hosthosthosthosthosthost';
const GUEST = 'did:plc:guestguestguestguestgues';
const OTHER = 'did:plc:otherotherotherotherothe';
const RKEY = '3lzzzzzzzzzzz';
const EVENT = singleEvent(HOST, RKEY);
const SPACE = privateEventSpace(HOST, RKEY);
const EVENT_URI = eventUri(EVENT);
const RECORD = {
	$type: EVENT_COLLECTION,
	name: 'Dinner',
	createdAt: '2026-11-04T00:00:00.000Z',
	startsAt: '2026-11-07T00:00:00.000Z'
};

/** A picture as atmo's upload hands it back, cited by the event's `media`. */
const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const picture = (blob: Record<string, unknown> = {}, cid = CID) => ({
	role: 'thumbnail',
	content: { $type: 'blob', ref: { $link: cid }, mimeType: 'image/webp', size: 1234, ...blob },
	aspect_ratio: { width: 800, height: 800 }
});

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
	publicProfile.mockReset();
	publicProfile.mockResolvedValue(null);
	publicProfiles.mockClear();
	reader.get.mockReset();
	reader.writers.mockReset();
	reader.blob.mockReset();
	actorToDid.mockReset();
	credentialSpaceReader.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('savePrivateEvent', () => {
	const input = { rkey: RKEY, record: { ...RECORD, media: [picture()] } };

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
			spaceType: 'community.lexicon.calendar.collection',
			skey: RKEY,
			policy: { $type: 'com.atproto.memberspace.policy' }
		});
		// A single event's guests see who answered, and only the host sees the whole list.
		expect(host.sent[0].body?.policy).not.toHaveProperty('publishMembers');
		expect(host.sent[2].body).toMatchObject({
			space: SPACE,
			repo: HOST,
			collection: EVENT_COLLECTION,
			rkey: RKEY
		});
	});

	it('stores the picture uploaded with it', async () => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await savePrivateEvent(host, input);
		expect(host.sent[2].body?.record).toMatchObject({ media: [picture()] });
	});

	it.each([
		['media that is not a list', { media: picture() }],
		['an item with no blob', { media: [{ role: 'thumbnail', image: 'x' }] }],
		['an item with no role', { media: [{ ...picture(), role: undefined }] }],
		['a blob that is not an image', { media: [picture({ mimeType: 'text/html' })] }],
		['a blob of an image type browsers sniff', { media: [picture({ mimeType: 'image/svg+xml' })] }],
		['a blob with no type', { media: [picture({ mimeType: undefined })] }],
		['a blob with no size', { media: [picture({ size: undefined })] }],
		['a blob too large', { media: [picture({ size: 50 * 1024 * 1024 })] }],
		['a blob ref that is not a CID', { media: [picture({}, '../../xrpc/elsewhere')] }],
		['a blob ref of the old shape', { media: [{ role: 'thumbnail', content: { cid: CID } }] }],
		['one bad item among good ones', { media: [picture(), picture({ mimeType: 'text/html' })] }]
	])('refuses %s, and writes nothing', async (_, bad) => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await expect(
			savePrivateEvent(host, { rkey: RKEY, record: { ...RECORD, ...bad } })
		).rejects.toMatchObject({ reason: 'not-an-event' });
		expect(host.sent).toHaveLength(0);
	});

	it('saves an edit into the space that is already there', async () => {
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.space.createSpace': refuse(400, 'SpaceAlreadyExists'),
			'com.atproto.space.getSpace': privateSpace
		});
		await expect(savePrivateEvent(host, input)).resolves.toMatchObject({ uri: EVENT_URI });
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

describe('an edit of a private event', () => {
	const menu = { name: 'Menu', uri: 'https://example.com/menu' };
	const flyer = { name: 'Event Image', uri: 'https://images.example.com/flyer.jpg' };
	const poster = { url: 'https://images.example.com/poster.jpg' };
	const media = [picture()];

	/** What the kit's editor saves from the edit page's copy, with the name changed and `media` as
	 *  its picture section left it. */
	async function edited(
		eventData: Awaited<ReturnType<typeof readPrivateEventForEdit>>,
		media?: unknown
	) {
		return buildEventRecord({
			eventData,
			isNew: false,
			name: 'Supper',
			description: '',
			startsAt: '2026-11-07T00:00',
			endsAt: '',
			timezone: 'UTC',
			mode: 'inperson',
			visibility: null,
			theme: { name: 'minimal', accentColor: 'purple', baseColor: 'mist' },
			links: (eventData?.uris ?? []).map((l) => ({ uri: l.uri, name: l.name ?? '' })),
			location: null,
			locationChanged: false,
			media: media as Array<Record<string, unknown>> | undefined,
			resolveHandle: async () => HOST
		});
	}

	/** The host's event as stored, its edit page's copy, and what a save of `record` stores. */
	async function editing(stored: Record<string, unknown>) {
		reader.get.mockImplementation(async ({ collection }: { collection: string }) =>
			spaceRecord(HOST, collection, stored)
		);
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		const eventData = await readPrivateEventForEdit(host, RKEY);
		const save = async (record: Record<string, unknown>) => {
			await savePrivateEvent(host, { rkey: RKEY, record });
			return host.sent.find((s) => s.pathname.endsWith('.putRecord'))?.body?.record as {
				uris?: unknown[];
				media?: unknown;
			};
		};
		return { eventData, save };
	}

	/** What the kit's picture section gives the save when no new image was chosen. */
	const picturePart = (
		eventData: Awaited<ReturnType<typeof readPrivateEventForEdit>>,
		change: { thumbnailChanged: boolean; thumbnailFile: null }
	) =>
		buildThumbnailMedia({
			isNew: false,
			...change,
			existingMedia: (eventData?.media ?? []) as Array<Record<string, unknown>>,
			uploadBlob: async () => {
				throw new Error('nothing to upload');
			}
		});

	it('keeps the outside image and links the edit page left out', async () => {
		const { eventData, save } = await editing({ ...RECORD, poster, uris: [flyer, menu] });
		expect(eventData).not.toHaveProperty('poster');
		const saved = await save(await edited(eventData));
		expect(saved).toMatchObject({ name: 'Supper', poster });
		expect(saved.uris).toHaveLength(2);
		expect(saved.uris).toEqual(expect.arrayContaining([flyer, menu]));
	});

	it('keeps the picture when it was left as it was', async () => {
		const { eventData, save } = await editing({ ...RECORD, media });
		expect(eventData?.media).toEqual(media);
		const kept = await picturePart(eventData, { thumbnailChanged: false, thumbnailFile: null });
		expect(await save(await edited(eventData, kept))).toMatchObject({ name: 'Supper', media });
	});

	it('stores the new picture when it was replaced', async () => {
		const { eventData, save } = await editing({ ...RECORD, media });
		// As the kit's buildThumbnailMedia gives it, which needs a browser to shrink the image first:
		// the other media as they were, and the new upload in the old one's role.
		const other = picture({}, 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
		const header = picture({}, 'bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
		const { eventData: withHeader } = await editing({
			...RECORD,
			media: [...media, { ...header, role: 'header' }]
		});
		const replaced = [{ ...header, role: 'header' }, other];
		expect(withHeader?.media).toHaveLength(2);
		expect(eventData?.media).toEqual(media);
		const saved = await save(await edited(eventData, replaced));
		expect(saved.media).toEqual(replaced);
	});

	it('stores no picture when it was removed, though one is stored', async () => {
		const { eventData, save } = await editing({ ...RECORD, media, poster });
		const removed = await picturePart(eventData, { thumbnailChanged: true, thumbnailFile: null });
		const saved = await save(await edited(eventData, removed));
		expect(saved).not.toHaveProperty('media');
		expect(saved).toMatchObject({ poster });
	});
});

describe('cancelPrivateEvent', () => {
	it('deletes the space of the caller’s own event, once it has checked it', async () => {
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await cancelPrivateEvent(host, RKEY);
		expect(host.nsids()).toEqual(['com.atproto.space.getSpace', 'com.atproto.space.deleteSpace']);
		expect(host.sent[0].query.get('space')).toBe(SPACE);
		expect(host.sent[1].body).toEqual({ space: SPACE });
	});
});

describe('putPrivateRsvp', () => {
	const answer = { status: 'going' as const, cid: `cid-of-${HOST}` };

	it('writes to the guest’s own repo in the space, under the event’s key', async () => {
		theSpaceHolds({});
		const guest = caller(GUEST, GUEST_SCOPE);
		await putPrivateRsvp(guest, EVENT, answer);
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
		await expect(putPrivateRsvp(guest, EVENT, { ...answer, cid: 'old' })).rejects.toMatchObject({
			reason: 'changed'
		});
		expect(guest.sent).toHaveLength(0);
	});

	it('refuses without a grant, and without reading', async () => {
		const stock = caller(OTHER, 'atproto');
		await expect(putPrivateRsvp(stock, EVENT, answer)).rejects.toMatchObject({
			reason: 'no-grant'
		});
		expect(reader.get).not.toHaveBeenCalled();
	});

	it('lets a host answer their own event with the host grant alone', async () => {
		theSpaceHolds({});
		const host = caller(HOST, HOST_SCOPE);
		await expect(putPrivateRsvp(host, EVENT, answer)).resolves.toBeUndefined();
	});
});

describe('readPrivateEventPicture', () => {
	const BYTES = new Uint8Array([1, 2, 3]);
	const read = (who = caller(GUEST, GUEST_SCOPE), cid = CID) =>
		readPrivateEventPicture(who, EVENT, cid);

	beforeEach(() => reader.blob.mockResolvedValue(BYTES));

	it('reads a picture the event cites from the host’s repo in its space, with the reader’s own access', async () => {
		theSpaceHolds({}, { ...RECORD, media: [picture()] } as typeof RECORD);
		expect(await read()).toEqual({ bytes: BYTES, type: 'image/webp' });
		expect(reader.blob).toHaveBeenCalledWith(
			{ space: SPACE, repo: HOST, cid: CID },
			MAX_PICTURE_BYTES
		);
		expect(credentialSpaceReader).toHaveBeenCalledTimes(1);
	});

	it('reads no blob the event does not cite', async () => {
		theSpaceHolds({}, { ...RECORD, media: [picture()] } as typeof RECORD);
		const other = 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		expect(await read(undefined, other)).toBeNull();
		expect(reader.blob).not.toHaveBeenCalled();
	});

	it('reads no blob the event cites in a way atmo would not serve', async () => {
		const svg = picture({ mimeType: 'image/svg+xml' });
		theSpaceHolds({}, { ...RECORD, media: [svg] } as typeof RECORD);
		expect(await read()).toBeNull();
		expect(reader.blob).not.toHaveBeenCalled();
	});

	it.each([
		['not there', async () => null],
		[
			'kept from the reader',
			async () => {
				throw new SpaceAccessDenied(SPACE, '400 SpaceNotFound');
			}
		]
	])('reads nothing when the event is %s', async (_, get) => {
		reader.get.mockImplementation(get);
		expect(await read()).toBeNull();
		expect(reader.blob).not.toHaveBeenCalled();
	});

	it('reads nothing when the host has no such blob', async () => {
		theSpaceHolds({}, { ...RECORD, media: [picture()] } as typeof RECORD);
		reader.blob.mockResolvedValue(null);
		expect(await read()).toBeNull();
	});

	it('does not pass an outage off as nothing there', async () => {
		reader.get.mockRejectedValue(new Error('500'));
		await expect(read()).rejects.toThrow();
	});

	it('refuses without a grant, and without reading', async () => {
		await expect(read(caller(OTHER, 'atproto'))).rejects.toMatchObject({ reason: 'no-grant' });
		expect(reader.get).not.toHaveBeenCalled();
	});

	it('lets the host read their own event’s picture with the host grant alone', async () => {
		theSpaceHolds({}, { ...RECORD, media: [picture()] } as typeof RECORD);
		expect(await read(caller(HOST, HOST_SCOPE))).toMatchObject({ bytes: BYTES });
	});
});

describe('readPrivateEventPage', () => {
	it('reads with credentials held for this request only', async () => {
		theSpaceHolds({});
		reader.writers.mockResolvedValue([]);
		const guest = caller(GUEST, GUEST_SCOPE);
		await readPrivateEventPage(guest, EVENT);
		await readPrivateEventPage(guest, EVENT);
		expect(credentialSpaceReader).toHaveBeenCalledTimes(2);
	});

	it.each([
		['refused', new SpaceAccessDenied(SPACE, '400 SpaceNotFound')],
		['cancelled', new SpaceAccessDenied(SPACE, '400 SpaceDeleted')]
	])('reads as nothing there when %s', async (_name, denial) => {
		reader.get.mockRejectedValue(denial);
		await expect(readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT)).resolves.toBeNull();
	});

	it('does not pass an outage off as nothing there', async () => {
		reader.get.mockRejectedValue(new Error('500'));
		await expect(readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT)).rejects.toThrow();
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
			expect(await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT)).toBeNull();
			expect(reader.writers).not.toHaveBeenCalled();
		}
	);

	it('keeps an event whose stored image is malformed, and shows no image', async () => {
		theSpaceHolds({}, { ...RECORD, media: 'not-media' } as unknown as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(page?.event.name).toBe(RECORD.name);
		expect(page?.event).not.toHaveProperty('media');
	});

	it('says the answers are unread when who wrote could not be read', async () => {
		theSpaceHolds({});
		reader.writers.mockRejectedValue(new Error('503'));
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () => Response.json({ members: [{ did: GUEST }] })
		});
		const page = await readPrivateEventPage(host, EVENT);
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
		const page = await readPrivateEventPage(host, EVENT);
		expect(page?.answersUnread).toBe(true);
		expect(page?.attendees.going.map((a) => a.did)).toEqual([OTHER]);
		expect(page?.guests).toMatchObject([
			{ did: GUEST, answer: null, answerUnread: true },
			{ did: OTHER, answer: 'going', answerUnread: false }
		]);
	});

	it('logs an answer it could not read without whose it is or which event', async () => {
		theSpaceHolds({});
		const fromSpace = reader.get.getMockImplementation()!;
		reader.get.mockImplementation(async (query: { repo: string; collection: string }) => {
			if (query.collection !== RSVP_COLLECTION) return fromSpace(query);
			const uri = `${SPACE}/${query.repo}/${RSVP_COLLECTION}/${RKEY}`;
			throw new Error(`com.atproto.space.getRecord: the MAC of ${uri} does not verify`);
		});
		reader.writers.mockResolvedValue([GUEST]);
		await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		const logs = [console.info, console.error].flatMap((log) =>
			vi.mocked(log).mock.calls.flat().map(String)
		);
		expect(logs.length).toBeGreaterThan(0);
		expect(logs.join('\n')).not.toContain(GUEST);
		expect(logs.join('\n')).not.toContain(RKEY);
	});

	it('does not call someone who has not answered unread', async () => {
		theSpaceHolds({});
		reader.writers.mockResolvedValue([]);
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () => Response.json({ members: [{ did: GUEST }] })
		});
		const page = await readPrivateEventPage(host, EVENT);
		expect(page?.answersUnread).toBe(false);
		expect(page?.guests).toMatchObject([{ did: GUEST, answer: null, answerUnread: false }]);
		expect(page?.guestsCapped).toBe(false);
	});

	it('shows the host the guests it listed, and that there may be more, past the page limit', async () => {
		theSpaceHolds({});
		reader.writers.mockResolvedValue([]);
		let listed = 0;
		const host = caller(HOST, HOST_SCOPE, {
			'com.atproto.memberspace.listMembers': () =>
				Response.json({ members: [{ did: `did:plc:guest${listed++}` }], cursor: 'more' })
		});
		const page = await readPrivateEventPage(host, EVENT);
		expect(page?.guestsCapped).toBe(true);
		expect(page?.guests).toHaveLength(10);
	});

	it('shows the pictures uploaded through atmo, and only the well-formed ones', async () => {
		const svg = picture({ mimeType: 'image/svg+xml' });
		theSpaceHolds({}, { ...RECORD, media: [{ image: 'x' }, picture(), svg] } as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(page?.event.media).toEqual([picture()]);
	});

	it('shows no media when none of it is well-formed', async () => {
		theSpaceHolds({}, { ...RECORD, media: [{ image: 'x' }] } as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(page?.event).not.toHaveProperty('media');
	});

	it('gives the kit no outside image to load by itself, and keeps the other links', async () => {
		const menu = { name: 'Menu', uri: 'https://example.com/menu' };
		const flyer = { name: 'Event Image', uri: 'https://images.example.com/flyer.jpg' };
		const poster = { url: 'https://images.example.com/poster.jpg' };
		theSpaceHolds({}, { ...RECORD, poster, uris: [flyer, menu] } as typeof RECORD);
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(getEventExternalImage(page!.event)).toBeNull();
		expect(page?.event.uris).toEqual([menu]);
	});

	it('splits answers, keeps "not going" off both lists, and finds the viewer’s own', async () => {
		theSpaceHolds({
			[HOST]: rsvp('going'),
			[GUEST]: rsvp('interested'),
			[OTHER]: rsvp('notgoing')
		});
		reader.writers.mockResolvedValue([HOST, GUEST, OTHER]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(page?.attendees.going.map((a) => a.did)).toEqual([HOST]);
		expect(page?.attendees.interested.map((a) => a.did)).toEqual([GUEST]);
		expect(page?.viewerStatus).toBe('interested');
	});

	it('counts no answer from someone the PDS no longer tracks, so they are asked again', async () => {
		theSpaceHolds({ [GUEST]: rsvp('going') });
		reader.writers.mockResolvedValue([]);
		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);
		expect(page?.viewerStatus).toBeNull();
		expect(page?.attendees.goingCount).toBe(0);
	});

	it('ignores an answer that names another event', async () => {
		theSpaceHolds({ [GUEST]: rsvp('going', 'at://someone/else/entirely') });
		reader.writers.mockResolvedValue([GUEST]);
		const page = await readPrivateEventPage(caller(HOST, HOST_SCOPE), EVENT);
		expect(page?.attendees.goingCount).toBe(0);
	});

	it('names people by their public name where they have one, and by handle where not', async () => {
		const names: Record<string, string> = { [GUEST]: 'Guest Person', [HOST]: 'Host Person' };
		publicProfile.mockImplementation(async (did) =>
			names[did] ? { displayName: names[did] } : null
		);
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		theSpaceHolds({ [GUEST]: rsvp('going'), [OTHER]: rsvp('going') });

		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);

		expect(page?.attendees.going).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					did: GUEST,
					name: 'Guest Person',
					handle: 'guestguestguestguestgues.example.com'
				}),
				expect.objectContaining({ did: OTHER, name: 'otherotherotherotherothe.example.com' })
			])
		);
		expect(page?.host).toMatchObject({ did: HOST, value: { displayName: 'Host Person' } });
	});

	it('looks up everyone it names in one go, and not someone who said no', async () => {
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		theSpaceHolds({ [GUEST]: rsvp('going'), [OTHER]: rsvp('notgoing') });

		await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);

		expect(publicProfiles).toHaveBeenCalledTimes(1);
		expect([...publicProfiles.mock.calls[0][0]].sort()).toEqual([GUEST, HOST].sort());
	});

	it('shows the avatar a person set in their public profile', async () => {
		const avatar = {
			$type: 'blob',
			ref: { $link: 'bafkreiavatar' },
			mimeType: 'image/jpeg',
			size: 1
		};
		publicProfile.mockImplementation(async (did) => (did === GUEST ? { avatar } : null));
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		theSpaceHolds({ [GUEST]: rsvp('going'), [OTHER]: rsvp('going') });

		const page = await readPrivateEventPage(caller(GUEST, GUEST_SCOPE), EVENT);

		const going = Object.fromEntries((page?.attendees.going ?? []).map((a) => [a.did, a.avatar]));
		expect(going[GUEST]).toContain(`${GUEST}/bafkreiavatar`);
		expect(going[OTHER]).toBeUndefined();
	});

	it('tells the host who said no, though they are on neither attendee list', async () => {
		theSpaceHolds({ [GUEST]: rsvp('notgoing'), [OTHER]: rsvp('interested') });
		reader.writers.mockResolvedValue([GUEST, OTHER]);
		const answers = {
			'com.atproto.memberspace.listMembers': () =>
				Response.json({ members: [{ did: GUEST }, { did: OTHER }] })
		};
		const page = await readPrivateEventPage(caller(HOST, HOST_SCOPE, answers), EVENT);
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
		const host = await readPrivateEventPage(caller(HOST, HOST_SCOPE, answers), EVENT);
		expect(host?.guests).toEqual([
			{ did: GUEST, handle: expect.any(String), answer: 'going', answerUnread: false },
			{ did: OTHER, handle: expect.any(String), answer: null, answerUnread: false }
		]);

		const guest = caller(GUEST, GUEST_SCOPE, answers);
		const seen = await readPrivateEventPage(guest, EVENT);
		expect(seen?.guests).toBeNull();
		expect(guest.nsids()).not.toContain('com.atproto.memberspace.listMembers');
	});
});

describe('addGuest', () => {
	it('puts the person the handle names on the list, able to read and answer', async () => {
		actorToDid.mockResolvedValue(GUEST);
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await addGuest(host, { rkey: RKEY, handleOrDid: '@guest.example.com ' });
		expect(actorToDid).toHaveBeenCalledWith('guest.example.com');
		expect(host.sent[1]).toMatchObject({
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
		const host = caller(HOST, HOST_SCOPE, { 'com.atproto.space.getSpace': privateSpace });
		await removeGuest(host, { rkey: RKEY, did: GUEST });
		expect(host.sent[1]).toMatchObject({
			pathname: '/xrpc/com.atproto.memberspace.removeMembers',
			body: { space: SPACE, dids: [GUEST] }
		});
	});
});

describe('myPrivateEvents', () => {
	const KEPT_OUT = privateEventSpace(OTHER, '3laaaaaaaaaaa');
	type Read = { space: string; collection: string; rkey: string };

	it('lists only what the person can still read, soonest first', async () => {
		const later = privateEventSpace(HOST, '3lbbbbbbbbbbb');
		reader.get.mockImplementation(async ({ space, rkey }: Read) => {
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
		expect(events[0]).toMatchObject({ href: expect.stringContaining('/private/') });
		expect(guest.sent[0].query.get('spaceType')).toBe('community.lexicon.calendar.collection');
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
		reader.get.mockImplementation(async ({ space }: Read) => {
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
		caller(did, scope, {
			'com.atproto.space.getSpace': privateSpace,
			[nsid]: () => Response.json(refusing, { status: 500 })
		});
	const host = (nsid: string) => refuses(HOST, HOST_SCOPE, nsid);
	const answer = { status: 'going' as const, cid: `cid-of-${HOST}` };
	const writes: Record<string, (nsid: string) => Promise<unknown>> = {
		'com.atproto.space.deleteSpace': (nsid) => cancelPrivateEvent(host(nsid), RKEY),
		'com.atproto.space.putRecord': (nsid) =>
			putPrivateRsvp(refuses(GUEST, GUEST_SCOPE, nsid), EVENT, answer),
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

describe('every write', () => {
	const SCOPES = `${HOST_SCOPE} ${GUEST_SCOPE}`;
	/** What it writes; the calls it makes to check the caller's own space before writing, or null
	 *  for one that checks none; and its refusal for a space that was never made. */
	const writes: [
		string,
		(c: CallerSession) => Promise<unknown>,
		string[] | null,
		Refusal | null
	][] = [
		[
			'a new event',
			(c) => savePrivateEvent(c, { rkey: RKEY, record: RECORD }),
			['createSpace', 'getSpace'],
			'refused'
		],
		['an event cancelled', (c) => cancelPrivateEvent(c, RKEY), ['getSpace'], 'no-event'],
		[
			'a guest added',
			(c) => addGuest(c, { rkey: RKEY, handleOrDid: 'other.example.com' }),
			['getSpace'],
			'no-event'
		],
		[
			'a guest taken off',
			(c) => removeGuest(c, { rkey: RKEY, did: OTHER }),
			['getSpace'],
			'no-event'
		],
		// An answer goes into the host's space, in the caller's own repo there, once the caller
		// has read the event with their own access.
		[
			'an answer',
			(c) => putPrivateRsvp(c, EVENT, { status: 'going', cid: `cid-of-${HOST}` }),
			[],
			'no-event'
		],
		['an answer taken back', (c) => deletePrivateRsvp(c, EVENT), null, null]
	];
	const isAnswer = (what: string) => what.startsWith('an answer');

	beforeEach(() => actorToDid.mockResolvedValue(OTHER));

	it.each(writes)(
		'%s goes only to the caller’s own space, or their own repo, whatever a page sends',
		async (what, write) => {
			// Any space of anyone's holds the event.
			theSpaceHolds({});
			const someone = caller(GUEST, SCOPES, { 'com.atproto.space.getSpace': privateSpace });
			await write(someone);
			const written = someone.sent.filter((sent) => sent.body);
			expect(written.length).toBeGreaterThan(0);
			for (const sent of someone.sent) {
				if (sent.body?.repo) expect(sent.body.repo).toBe(GUEST);
				if (isAnswer(what)) continue;
				for (const space of [sent.body?.space, sent.query.get('space')]) {
					if (space) expect(space).toMatch(new RegExp(`^at://${GUEST}/`));
				}
			}
		}
	);

	it.each(
		writes.flatMap(([what, write, before, gone]) =>
			[
				['was never made', refuse(400, 'SpaceNotFound'), gone],
				[
					'anyone can read',
					() =>
						Response.json({
							policy: { $type: 'com.atproto.memberspace.policy', publicRead: true }
						}),
					'not-private'
				],
				[
					'another policy governs',
					() => Response.json({ policy: { $type: 'com.atproto.managedspace.policy' } }),
					'not-private'
				],
				// atmo never makes one, so it is another app's.
				[
					'shows its people to everyone on it',
					() =>
						Response.json({
							policy: {
								$type: 'com.atproto.memberspace.policy',
								publishPolicy: true,
								publishMembers: true
							}
						}),
					'not-single'
				]
			]
				// An answer's check is its read of the event, which a space never made turns away.
				.filter(([space]) => before && (before.length > 0 || space === 'was never made'))
				.map(
					([space, getSpace, reason]) => [what, space, write, getSpace, reason, before!] as const
				)
		)
	)(
		'%s is refused before anything is written, in a space that %s',
		async (_, space, write, getSpace, reason, before) => {
			theSpaceHolds({});
			if (space === 'was never made') {
				reader.get.mockRejectedValue(new SpaceAccessDenied(SPACE, '400 SpaceNotFound'));
			}
			const host = caller(HOST, SCOPES, {
				'com.atproto.space.getSpace': getSpace as () => Response
			});
			await expect(write(host)).rejects.toMatchObject({ reason });
			expect(host.nsids()).toEqual(before.map((nsid) => `com.atproto.space.${nsid}`));
		}
	);
});
