import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), beta: vi.fn() }));
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: mocks.enabled,
	spacesServer: () => null
}));
vi.mock('#lib/private-events/server/beta.js', () => ({ privateEventsBeta: mocks.beta }));
vi.mock('#lib/private-events/server/caller.js', () => ({ callerSession: async () => null }));
const { load } = await import('./+page.server');

const locals = { did: 'did:plc:alice', session: null, client: {} };
const cookies = { get: () => undefined, delete: () => {} };
const run = () => load({ locals, cookies } as never) as Promise<{ privateEvents: boolean }>;

beforeEach(() => {
	mocks.enabled.mockReturnValue(true);
	mocks.beta.mockResolvedValue(true);
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
