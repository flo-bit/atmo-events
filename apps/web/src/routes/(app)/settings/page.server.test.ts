import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERRED_CLIENT_COLLECTION } from '@atmo-dev/kit/social';

const mocks = vi.hoisted(() => ({ can: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('#lib/atproto/server/oauth.js', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
import { actions, load } from './+page.server';

function event(fields: Record<string, string | undefined> = { client: 'mu' }, signedIn = true) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) body.set(key, value);
	}
	return {
		locals: {
			did: signedIn ? 'did:plc:alice' : null,
			client: signedIn ? { get: mocks.get, post: mocks.post } : null
		},
		request: new Request('https://atmo.rsvp/settings', { method: 'POST', body })
	} as unknown as Parameters<NonNullable<typeof actions.default>>[0];
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.can.mockResolvedValue(true);
	mocks.get.mockResolvedValue({ ok: false, data: { error: 'RecordNotFound' } });
	mocks.post.mockResolvedValue({ ok: true, data: {} });
});

describe('social-client settings', () => {
	it('requires authentication', async () => {
		expect(await actions.default!(event(undefined, false))).toMatchObject({ status: 401 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('requires new OAuth permissions for existing sessions', async () => {
		mocks.can.mockResolvedValue(false);
		expect(await actions.default!(event())).toMatchObject({ status: 403 });
		expect(await load(event() as never)).toMatchObject({ canSaveClient: false });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('creates the singleton in the authenticated viewer’s repo', async () => {
		expect(await actions.default!(event())).toEqual({ saved: true });
		expect(mocks.post).toHaveBeenCalledWith('com.atproto.repo.putRecord', {
			input: {
				repo: 'did:plc:alice',
				collection: PREFERRED_CLIENT_COLLECTION,
				rkey: 'self',
				record: { $type: PREFERRED_CLIENT_COLLECTION, client: 'mu' },
				swapRecord: null
			}
		});
	});
	it('updates using a CID guard, preserving extension fields and dropping stale custom URLs', async () => {
		mocks.get.mockResolvedValue({
			ok: true,
			data: {
				cid: 'old-cid',
				value: { client: 'custom', customUrl: 'https://old.test', extension: true }
			}
		});
		await actions.default!(event());
		expect(mocks.post).toHaveBeenCalledWith('com.atproto.repo.putRecord', {
			input: expect.objectContaining({
				swapRecord: 'old-cid',
				record: { $type: PREFERRED_CLIENT_COLLECTION, client: 'mu', extension: true }
			})
		});
	});
	it('normalizes and saves a custom client', async () => {
		await actions.default!(event({ client: 'custom', customUrl: 'https://client.example/app/' }));
		expect(mocks.post).toHaveBeenCalledWith('com.atproto.repo.putRecord', {
			input: expect.objectContaining({
				record: {
					$type: PREFERRED_CLIENT_COLLECTION,
					client: 'custom',
					customUrl: 'https://client.example/app'
				}
			})
		});
	});
	it.each([
		{ client: 'unknown' },
		{ client: 'custom', customUrl: 'javascript:alert(1)' },
		{ client: 'custom' }
	])('validates untrusted input: %j', async (fields) => {
		expect(await actions.default!(event(fields))).toMatchObject({ status: 400 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('never treats a failed read as a missing record', async () => {
		mocks.get.mockResolvedValue({ ok: false, data: { error: 'InternalServerError' } });
		expect(await actions.default!(event())).toMatchObject({ status: 502 });
		expect(mocks.post).not.toHaveBeenCalled();
	});
	it('reports concurrent updates instead of overwriting them', async () => {
		mocks.post.mockResolvedValue({ ok: false, data: { error: 'InvalidSwap' } });
		expect(await actions.default!(event())).toMatchObject({ status: 409 });
	});
	it('reports failed writes without claiming success', async () => {
		mocks.post.mockResolvedValue({ ok: false, data: { error: 'InternalServerError' } });
		expect(await actions.default!(event())).toMatchObject({ status: 502 });
	});
});
