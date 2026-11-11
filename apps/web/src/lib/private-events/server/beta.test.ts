import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';
import { BETA_COLLECTION, BETA_RKEY, BETA_SCOPE, privateEventsBetaOn } from '../beta';

const mocks = vi.hoisted(() => ({ can: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('#lib/atproto/server/oauth.js', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
const { BetaNotSaved, canSaveBeta, privateEventsBeta, readBetaRecord, saveBeta } =
	await import('./beta');

const DID = 'did:plc:alice';
const client = { get: mocks.get, post: mocks.post } as unknown as Client;
const found = (value: Record<string, unknown>) => ({ ok: true, data: { cid: 'cid1', value } });

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	mocks.can.mockResolvedValue(true);
	mocks.get.mockResolvedValue({ ok: false, data: { error: 'RecordNotFound' } });
	mocks.post.mockResolvedValue({ ok: true, data: {} });
});

describe('the beta record', () => {
	it('is a singleton the person writes to their own repo, with no delete', () => {
		expect([BETA_COLLECTION, BETA_RKEY]).toEqual(['rsvp.atmo.actor.privateEventsBeta', 'self']);
		expect(BETA_SCOPE).toBe('repo:rsvp.atmo.actor.privateEventsBeta?action=create&action=update');
	});
	it('is on only when it says privateEvents: true', () => {
		expect(privateEventsBetaOn({ privateEvents: true })).toBe(true);
		for (const value of [
			null,
			undefined,
			{},
			{ privateEvents: false },
			{ privateEvents: 'true' }
		]) {
			expect(privateEventsBetaOn(value)).toBe(false);
		}
	});
});

describe('reading it', () => {
	it('reads the record from the person’s own PDS, with a time limit', async () => {
		mocks.get.mockResolvedValue(found({ privateEvents: true }));
		expect(await privateEventsBeta({ client, did: DID })).toBe(true);
		expect(mocks.get).toHaveBeenCalledWith('com.atproto.repo.getRecord', {
			params: { repo: DID, collection: BETA_COLLECTION, rkey: BETA_RKEY },
			signal: expect.any(AbortSignal)
		});
	});
	it('is off with no record, signed out, or when the PDS fails', async () => {
		expect(await privateEventsBeta({ client, did: DID })).toBe(false);
		expect(await privateEventsBeta({ client: null, did: null })).toBe(false);
		mocks.get.mockRejectedValue(new Error('PDS unavailable'));
		expect(await privateEventsBeta({ client, did: DID })).toBe(false);
	});
	it('does not take a failed read for a missing record', async () => {
		mocks.get.mockResolvedValue({ ok: false, data: { error: 'InternalServerError' } });
		await expect(readBetaRecord(client, DID as never)).rejects.toThrow();
	});
});

describe('saving it', () => {
	it('needs both create and update', async () => {
		expect(await canSaveBeta()).toBe(true);
		mocks.can.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		expect(await canSaveBeta()).toBe(false);
	});
	it('creates the record when there is none', async () => {
		await saveBeta(client, DID as never, true, new Date('2026-11-10T12:00:00.000Z'));
		expect(mocks.post).toHaveBeenCalledWith('com.atproto.repo.putRecord', {
			input: {
				repo: DID,
				collection: BETA_COLLECTION,
				rkey: BETA_RKEY,
				record: {
					$type: BETA_COLLECTION,
					privateEvents: true,
					updatedAt: '2026-11-10T12:00:00.000Z'
				},
				swapRecord: null
			}
		});
	});
	it('keeps fields it doesn’t know, over the record as it was read', async () => {
		mocks.get.mockResolvedValue(found({ privateEvents: true, note: 'kept' }));
		await saveBeta(client, DID as never, false);
		const { input } = mocks.post.mock.calls[0][1];
		expect(input.record).toMatchObject({ privateEvents: false, note: 'kept' });
		expect(input.swapRecord).toBe('cid1');
	});
	it('says when the record changed elsewhere', async () => {
		mocks.post.mockResolvedValue({ ok: false, data: { error: 'InvalidSwap' } });
		await expect(saveBeta(client, DID as never, true)).rejects.toThrow(
			new BetaNotSaved('This setting changed elsewhere. Reload and try again.')
		);
	});
});
