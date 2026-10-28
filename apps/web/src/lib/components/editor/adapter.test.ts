import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	putRecord: vi.fn(),
	createRecord: vi.fn(),
	deleteRecord: vi.fn(),
	uploadBlob: vi.fn(),
	getRecord: vi.fn(),
	resolveHandle: vi.fn(),
	goto: vi.fn(),
	login: vi.fn(),
	notify: vi.fn()
}));
vi.mock('#lib/atproto/repo.remote.js', () => mocks);
vi.mock('@svelte-atproto/oauth/helper', () => mocks);
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('#lib/components/LoginModal.svelte', () => ({
	atProtoLoginModalState: { show: mocks.login }
}));
vi.mock('#lib/contrail.js', () => ({ notifyContrailOfUpdate: mocks.notify }));
import { createInAppAdapter } from './adapter';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const adapter = createInAppAdapter({ viewer: { did, isLoggedIn: true } });
beforeEach(() => vi.resetAllMocks());

describe('editor integration without the methods facade', () => {
	it('uses the secured remote write results directly', async () => {
		const result = { uri: `at://${did}/community.lexicon.calendar.event/event`, cid: 'cid' };
		mocks.putRecord.mockResolvedValue(result);
		mocks.createRecord.mockResolvedValue(result);
		const input = {
			collection: 'community.lexicon.calendar.event',
			rkey: 'event',
			record: { name: 'Meetup' }
		};
		expect(await adapter.putRecord(input)).toEqual({ uri: result.uri });
		expect(await adapter.createRecord(input)).toEqual(result);
		await adapter.deleteRecord({ collection: input.collection, rkey: input.rkey });
		expect(mocks.putRecord).toHaveBeenCalledExactlyOnceWith(input);
		expect(mocks.createRecord).toHaveBeenCalledExactlyOnceWith(input);
		expect(mocks.deleteRecord).toHaveBeenCalledExactlyOnceWith({
			collection: input.collection,
			rkey: input.rkey
		});
	});

	it('encodes uploads once at the remote boundary, preserving the blob reference', async () => {
		const ref = { $type: 'blob', ref: { $link: 'cid' }, mimeType: 'image/png', size: 3 };
		mocks.uploadBlob.mockResolvedValue(ref);
		expect(
			await adapter.uploadBlob(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
		).toBe(ref);
		expect(mocks.uploadBlob).toHaveBeenCalledExactlyOnceWith({
			bytes: [1, 2, 3],
			mimeType: 'image/png'
		});
	});

	it('delegates public record reads and handle resolution to the library', async () => {
		mocks.getRecord.mockResolvedValue({ value: { name: 'Meetup' } });
		mocks.resolveHandle.mockResolvedValue(did);
		const input = { did, collection: 'community.lexicon.calendar.event', rkey: 'event' };
		expect(await adapter.getRecord(input)).toEqual({ value: { name: 'Meetup' } });
		expect(mocks.getRecord).toHaveBeenCalledExactlyOnceWith(input);
		expect(await adapter.resolveHandle('alice.test')).toBe(did);
		expect(mocks.resolveHandle).toHaveBeenCalledExactlyOnceWith({ handle: 'alice.test' });
	});

	it('surfaces rejected writes instead of wrapping every response as ok', async () => {
		mocks.putRecord.mockRejectedValue(new Error('PDS rejected write'));
		await expect(
			adapter.putRecord({
				collection: 'community.lexicon.calendar.event',
				rkey: 'event',
				record: {}
			})
		).rejects.toThrow('PDS rejected write');
	});
});
