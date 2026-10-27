import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	can: vi.fn(),
	post: vi.fn(),
	getRequestEvent: vi.fn()
}));
vi.mock('$app/server', () => ({
	command: (_schema: unknown, handler: unknown) =>
		Object.assign(handler as object, { __: { type: 'command' } }),
	getRequestEvent: mocks.getRequestEvent
}));
vi.mock('./server/oauth', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
import { createRecord, putRecord, deleteRecord } from './repo.remote';

beforeEach(() => {
	vi.resetAllMocks();
	mocks.getRequestEvent.mockReturnValue({
		locals: { did: 'did:plc:alice', client: { post: mocks.post } }
	});
	mocks.post.mockResolvedValue({
		ok: true,
		data: { uri: 'at://did:plc:alice/app.bsky.feed.post/post', cid: 'cid' }
	});
});

describe('Bluesky write enforcement', () => {
	it('rejects direct post requests without a concrete grant, not only in the UI', async () => {
		mocks.can.mockResolvedValue(false);
		await expect(
			createRecord({ collection: 'app.bsky.feed.post', record: {} })
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('checks create permission before posting', async () => {
		mocks.can.mockResolvedValue(true);
		await createRecord({ collection: 'app.bsky.feed.post', record: {} });
		expect(mocks.can).toHaveBeenCalledExactlyOnceWith({
			type: 'repo',
			collection: 'app.bsky.feed.post',
			action: 'create'
		});
		expect(mocks.post).toHaveBeenCalledOnce();
	});
	it('checks the appropriate action for update and delete', async () => {
		mocks.can.mockResolvedValue(false);
		await expect(
			putRecord({ collection: 'app.bsky.feed.post', rkey: 'post', record: {} })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			deleteRecord({ collection: 'app.bsky.feed.post', rkey: 'post' })
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.can.mock.calls.map(([capability]) => capability.action)).toEqual([
			'update',
			'delete'
		]);
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('leaves required calendar writes independent of optional Bluesky access', async () => {
		await createRecord({ collection: 'community.lexicon.calendar.event', record: {} });
		await putRecord({ collection: 'community.lexicon.calendar.rsvp', rkey: 'rsvp', record: {} });
		expect(mocks.can).not.toHaveBeenCalled();
		expect(mocks.post).toHaveBeenCalledTimes(2);
	});
	it('propagates PDS write failures instead of returning a successful-looking result', async () => {
		mocks.post.mockResolvedValue({ ok: false, status: 409, data: { error: 'InvalidSwap' } });
		const input = { collection: 'community.lexicon.calendar.event', rkey: 'event', record: {} };
		await expect(createRecord(input)).rejects.toMatchObject({ status: 409 });
		await expect(putRecord(input)).rejects.toMatchObject({ status: 409 });
		await expect(deleteRecord(input)).rejects.toMatchObject({ status: 409 });
	});
	it('fails closed when the token grant cannot be read', async () => {
		mocks.can.mockRejectedValue(new Error('temporary token failure'));
		await expect(createRecord({ collection: 'app.bsky.feed.post', record: {} })).rejects.toThrow(
			'temporary token failure'
		);
		expect(mocks.post).not.toHaveBeenCalled();
	});
});
