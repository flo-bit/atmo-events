import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	enabled: vi.fn(),
	beta: vi.fn(),
	caller: vi.fn()
}));
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: mocks.enabled,
	spacesServer: () => null
}));
vi.mock('#lib/private-events/server/beta.js', () => ({ privateEventsBeta: mocks.beta }));
vi.mock('#lib/private-events/server/caller.js', () => ({ callerSession: mocks.caller }));
const { load } = await import('./+page.server');

const locals = { did: 'did:plc:alice', session: null, client: {} };
const run = (path = '/create') =>
	load({ locals, url: new URL(path, 'https://atmo.example.com') } as never) as Promise<{
		privateEvents: boolean;
		hostAccess: unknown;
	}>;
/** Signed in, without the permission to host private events. */
const withoutHostGrant = { did: locals.did, scope: 'atproto' };

beforeEach(() => {
	mocks.enabled.mockReturnValue(true);
	mocks.beta.mockResolvedValue(true);
	mocks.caller.mockResolvedValue(null);
});

describe('the private choice on /create', () => {
	it('is offered to someone who turned the beta on', async () => {
		expect((await run()).privateEvents).toBe(true);
		expect(mocks.beta).toHaveBeenCalledWith(locals);
	});
	it('is not offered with the beta off', async () => {
		mocks.beta.mockResolvedValue(false);
		expect((await run()).privateEvents).toBe(false);
	});
	it('is not offered, and the beta not read, where the deployment has private events off', async () => {
		mocks.enabled.mockReturnValue(false);
		expect((await run()).privateEvents).toBe(false);
		expect(mocks.beta).not.toHaveBeenCalled();
	});
});

describe('asking for the permission to host, above the editor on /create', () => {
	beforeEach(() => mocks.caller.mockResolvedValue(withoutHostGrant));

	it('is asked of someone with the beta on and no permission yet', async () => {
		expect((await run()).hostAccess).toBe('ask');
	});
	it('says their server said no when they come back from asking without it', async () => {
		expect((await run(`/create?asked=${locals.did}`)).hostAccess).toBe('refused');
	});
	it('is asked again on a later visit, since nothing about the ask is kept', async () => {
		await run(`/create?asked=${locals.did}`);
		expect((await run()).hostAccess).toBe('ask');
	});
	it('is not asked with the beta off', async () => {
		mocks.beta.mockResolvedValue(false);
		expect((await run()).hostAccess).toBeNull();
	});
	it('is not asked where the deployment has private events off', async () => {
		mocks.enabled.mockReturnValue(false);
		expect((await run()).hostAccess).toBeNull();
	});
});
