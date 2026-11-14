import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOST = 'did:plc:hosthosthosthosthosthost';
const OTHER = 'did:plc:otherotherotherotherothe';
const RKEY = '3lzzzzzzzzzzz';

const setHeaders = vi.fn();
const callerSession = vi.fn();
vi.mock('#lib/actor.js', () => ({ getActor: async (actor: string) => actor }));
vi.mock('#lib/private-events/scopes.js', () => ({ holdsHostGrant: () => true }));
vi.mock('#lib/private-events/server/caller.js', () => ({
	callerSession: (session: unknown) => callerSession(session)
}));
vi.mock('#lib/private-events/server/enabled.js', () => ({ privateEventsEnabled: () => true }));
vi.mock('#lib/private-events/server/events.js', () => ({
	readPrivateEventForEdit: async () => ({ name: 'Dinner at the secret place' })
}));
vi.mock('#lib/spaces/server/other-servers.js', () => ({ timeLimitedNetwork: () => ({}) }));

const { load } = await import('./+page.server');

const request = () =>
	({
		params: { actor: HOST, rkey: RKEY },
		locals: { session: {} },
		setHeaders
	}) as unknown as Parameters<typeof load>[0];

describe('a private event’s edit page', () => {
	beforeEach(() => {
		setHeaders.mockClear();
		callerSession.mockReset();
	});

	it('is never stored, since it holds the event', async () => {
		callerSession.mockResolvedValue({ did: HOST, scope: '' });
		await expect(load(request())).resolves.toMatchObject({ rkey: RKEY });
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' });
	});

	it('is not stored for someone kept out either', async () => {
		callerSession.mockResolvedValue({ did: OTHER, scope: '' });
		await expect(load(request())).rejects.toMatchObject({ status: 404 });
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' });
	});
});
