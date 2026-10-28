import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getBotHandle: vi.fn(),
	getServerClient: vi.fn(),
	findEventLink: vi.fn(),
	resolveActorDid: vi.fn(),
	loadEvent: vi.fn(),
	rsvpOnBehalf: vi.fn(),
	likePost: vi.fn(),
	replyToPost: vi.fn(),
	recordOutcome: vi.fn()
}));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: mocks.getServerClient }));
vi.mock('./session', () => ({ getBotHandle: mocks.getBotHandle }));
vi.mock('./resolve-event', () => ({
	findEventLink: mocks.findEventLink,
	resolveActorDid: mocks.resolveActorDid,
	loadEvent: mocks.loadEvent
}));
vi.mock('./rsvp', () => ({ rsvpOnBehalf: mocks.rsvpOnBehalf }));
vi.mock('./actions', () => ({ likePost: mocks.likePost, replyToPost: mocks.replyToPost }));
vi.mock('./db', () => ({
	ensureBotSchema: vi.fn(),
	getProcessed: vi.fn(async () => new Set()),
	recordOutcome: mocks.recordOutcome,
	repliedNoEventRecently: vi.fn(async () => false),
	repliedNoTokenRecently: vi.fn(async () => false)
}));
import { processBotMentions } from './process-mentions';
import { REPLIES } from './config';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getBotHandle.mockResolvedValue({
		did: 'did:plc:bot',
		flush: vi.fn(),
		client: {
			get: vi.fn(async () => ({
				ok: true,
				data: {
					notifications: [
						{
							uri: 'at://mention',
							cid: 'mention-cid',
							reason: 'mention',
							author: { did: 'did:plc:attendee' },
							record: { text: '@going.atmo.rsvp' }
						}
					]
				}
			}))
		}
	});
	mocks.findEventLink.mockResolvedValue({ actor: 'host.example', rkey: 'event' });
	mocks.resolveActorDid.mockResolvedValue('did:plc:host');
	mocks.rsvpOnBehalf.mockResolvedValue('ok');
});

describe('reply bot RSVP requests', () => {
	it.each([false, true])(
		'does not RSVP or like when rsvpExpected=false (external: %s)',
		async (externalOnly) => {
			mocks.loadEvent.mockResolvedValue({
				uri: 'at://event',
				cid: 'event-cid',
				rsvpExpected: false,
				externalOnly,
				externalRsvpUrl: 'https://example.com/event'
			});
			await processBotMentions({} as Cloudflare.Env, {} as D1Database);
			expect(mocks.rsvpOnBehalf).not.toHaveBeenCalled();
			expect(mocks.likePost).not.toHaveBeenCalled();
			expect(mocks.replyToPost).toHaveBeenCalledWith(
				expect.anything(),
				'did:plc:bot',
				expect.objectContaining({
					text: REPLIES.notExpected
				})
			);
			expect(mocks.recordOutcome).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					outcome: 'replied_not_expected',
					eventUri: 'at://event'
				})
			);
		}
	);

	it.each([undefined, true])('keeps bot RSVPs for rsvpExpected=%s', async (rsvpExpected) => {
		mocks.loadEvent.mockResolvedValue({
			uri: 'at://event',
			cid: 'event-cid',
			rsvpExpected,
			externalOnly: false,
			externalRsvpUrl: null
		});
		await processBotMentions({} as Cloudflare.Env, {} as D1Database);
		expect(mocks.rsvpOnBehalf).toHaveBeenCalledOnce();
		expect(mocks.likePost).toHaveBeenCalledOnce();
		expect(mocks.replyToPost).not.toHaveBeenCalled();
	});
});
