import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RSVP_COLLECTION, singleEvent } from './ids';

const { invalidateAll, rsvpToPrivateEvent, cancelPrivateRsvp } = vi.hoisted(() => ({
	invalidateAll: vi.fn(async () => {}),
	rsvpToPrivateEvent: vi.fn(),
	cancelPrivateRsvp: vi.fn()
}));
vi.mock('$app/navigation', () => ({ invalidateAll }));
vi.mock('./private-events.remote', () => ({ rsvpToPrivateEvent, cancelPrivateRsvp }));
vi.mock('#lib/components/editor/adapter.js', () => ({ createInAppAdapter: () => ({}) }));

const { createPrivateRsvpAdapter } = await import('./rsvp-adapter');

const HOST = 'did:plc:hosthosthosthosthosthost';
const viewer = {
	isLoggedIn: true,
	did: 'did:plc:guestguestguestguestgues',
	canPostToBluesky: false
};
const answer = (cid: string) => ({
	collection: RSVP_COLLECTION,
	rkey: '3lzzzzzzzzzzz',
	record: { status: `${RSVP_COLLECTION}#going`, subject: { uri: 'at://x', cid } }
});
const adapter = () => createPrivateRsvpAdapter(singleEvent(HOST, '3lzzzzzzzzzzz'), viewer as never);

beforeEach(() => {
	invalidateAll.mockClear();
	rsvpToPrivateEvent.mockReset();
});

describe('answering from a page that has gone stale', () => {
	it('fetches the page again when refused, so the next try sends what the event is now', async () => {
		const refused = { status: 409, body: { message: 'changed' } };
		rsvpToPrivateEvent.mockRejectedValue(refused);
		await expect(adapter().putRecord(answer('old-cid') as never)).rejects.toBe(refused);
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('leaves the page alone when saved', async () => {
		rsvpToPrivateEvent.mockResolvedValue(undefined);
		await adapter().putRecord(answer('cid') as never);
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('leaves the page alone when the failure says nothing about the event', async () => {
		const offline = new TypeError('Failed to fetch');
		rsvpToPrivateEvent.mockRejectedValue(offline);
		await expect(adapter().putRecord(answer('cid') as never)).rejects.toBe(offline);
		expect(invalidateAll).not.toHaveBeenCalled();
	});
});

describe('telling the page what was answered', () => {
	const told = vi.fn();
	const listening = () =>
		createPrivateRsvpAdapter(singleEvent(HOST, '3lzzzzzzzzzzz'), viewer as never, told);
	beforeEach(() => told.mockClear());

	it('tells it each answer once it is saved', async () => {
		rsvpToPrivateEvent.mockResolvedValue({});
		await listening().putRecord(answer('cid') as never);
		expect(told).toHaveBeenCalledWith('going');
	});

	it('tells it nothing when the answer is refused', async () => {
		rsvpToPrivateEvent.mockRejectedValue(new Error('502'));
		await expect(listening().putRecord(answer('cid') as never)).rejects.toThrow();
		expect(told).not.toHaveBeenCalled();
	});

	it('tells it there is none once the answer is taken back', async () => {
		cancelPrivateRsvp.mockResolvedValue({});
		await listening().deleteRecord({ collection: RSVP_COLLECTION, rkey: '3lzzzzzzzzzzz' } as never);
		expect(told).toHaveBeenCalledWith(null);
	});
});
