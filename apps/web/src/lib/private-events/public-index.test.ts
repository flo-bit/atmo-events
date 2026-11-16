import { beforeEach, describe, expect, it, vi } from 'vitest';

// The in-app adapter both private adapters start from, as it is: its notify tells the public index
// about a write, and its writes go to the person's public repo.
const mocks = vi.hoisted(() => ({
	notify: vi.fn(),
	putRecord: vi.fn(),
	createRecord: vi.fn(),
	deleteRecord: vi.fn(),
	uploadBlob: vi.fn(),
	savePrivateEvent: vi.fn(async () => ({ uri: 'at://x', cid: 'cid' })),
	cancelPrivateEvent: vi.fn(async () => {}),
	rsvpToPrivateEvent: vi.fn(async () => {}),
	cancelPrivateRsvp: vi.fn(async () => {})
}));
vi.mock('#lib/contrail.js', () => ({ notifyContrailOfUpdate: mocks.notify }));
vi.mock('#lib/atproto/repo.remote.js', () => ({
	putRecord: mocks.putRecord,
	createRecord: mocks.createRecord,
	deleteRecord: mocks.deleteRecord,
	uploadBlob: mocks.uploadBlob
}));
vi.mock('@svelte-atproto/oauth/helper', () => ({ getRecord: vi.fn(), resolveHandle: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
vi.mock('./private-events.remote', () => ({
	savePrivateEvent: mocks.savePrivateEvent,
	cancelPrivateEvent: mocks.cancelPrivateEvent,
	rsvpToPrivateEvent: mocks.rsvpToPrivateEvent,
	cancelPrivateRsvp: mocks.cancelPrivateRsvp
}));

const { createPrivateEventAdapter } = await import('./editor-adapter');
const { createPrivateRsvpAdapter } = await import('./rsvp-adapter');
const { EVENT_COLLECTION, eventUri, RSVP_COLLECTION, singleEvent } = await import('./ids');

const HOST = 'did:plc:hosthosthosthosthosthost';
const RKEY = '3lzzzzzzzzzzz';
const EVENT = singleEvent(HOST, RKEY);
const viewer = { isLoggedIn: true, did: HOST, handle: 'host.example.com', canPostToBluesky: false };

beforeEach(() => vi.clearAllMocks());

describe('a private event and the public index', () => {
	it('the editor tells the index nothing, and writes nothing to the public repo', async () => {
		const adapter = createPrivateEventAdapter(viewer);
		const record = { name: 'Dinner' };
		await adapter.createRecord({ collection: EVENT_COLLECTION, rkey: RKEY, record });
		await adapter.putRecord({ collection: EVENT_COLLECTION, rkey: RKEY, record });
		await adapter.deleteRecord({ collection: EVENT_COLLECTION, rkey: RKEY });
		await adapter.notifyUpdate?.(eventUri(EVENT));
		expect(mocks.savePrivateEvent).toHaveBeenCalledTimes(2);
		expect(mocks.notify).not.toHaveBeenCalled();
		for (const write of [mocks.putRecord, mocks.createRecord, mocks.deleteRecord]) {
			expect(write).not.toHaveBeenCalled();
		}
	});

	it('an answer tells the index nothing, and writes nothing to the public repo', async () => {
		const adapter = createPrivateRsvpAdapter(EVENT, viewer);
		const record = {
			status: `${RSVP_COLLECTION}#going`,
			subject: { uri: eventUri(EVENT), cid: 'cid' }
		};
		await adapter.putRecord({ collection: RSVP_COLLECTION, rkey: RKEY, record });
		await adapter.deleteRecord({ collection: RSVP_COLLECTION, rkey: RKEY });
		await adapter.notifyUpdate?.(eventUri(EVENT));
		expect(mocks.rsvpToPrivateEvent).toHaveBeenCalledOnce();
		expect(mocks.notify).not.toHaveBeenCalled();
		for (const write of [mocks.putRecord, mocks.createRecord, mocks.deleteRecord]) {
			expect(write).not.toHaveBeenCalled();
		}
	});
});
