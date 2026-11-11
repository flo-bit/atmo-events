import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateEventRefused } from './events';

const caller = { did: 'did:plc:hosthosthosthosthosthost', scope: '', handle: vi.fn() };
/** The request's own session, which is the only one that signs anyone in here. */
const state = vi.hoisted(() => {
	const SESSION = { from: 'this request' };
	return { SESSION, enabled: true, session: SESSION as unknown };
});
vi.mock('$app/server', () => ({ getRequestEvent: () => ({ locals: { session: state.session } }) }));
vi.mock('./enabled', () => ({ privateEventsEnabled: () => state.enabled }));
vi.mock('./caller', () => ({
	callerSession: async (session: unknown) => (session === state.SESSION ? caller : null)
}));

const { asCaller } = await import('./command');
const run = vi.fn();

beforeEach(() => {
	state.enabled = true;
	state.session = state.SESSION;
	run.mockReset();
});

describe('a private events command', () => {
	it('is not there when private events are off', async () => {
		state.enabled = false;
		await expect(asCaller(run)).rejects.toMatchObject({ status: 404 });
		expect(run).not.toHaveBeenCalled();
	});

	it('asks someone signed out to sign in, and does nothing', async () => {
		state.session = null;
		await expect(asCaller(run)).rejects.toMatchObject({ status: 401 });
		expect(run).not.toHaveBeenCalled();
	});

	it('runs as the signed-in person', async () => {
		run.mockResolvedValue('done');
		await expect(asCaller(run)).resolves.toBe('done');
		expect(run).toHaveBeenCalledWith(caller);
	});

	it('answers a refusal with its own words, so it never reads as saved', async () => {
		const refused = new PrivateEventRefused('no-such-person');
		run.mockRejectedValue(refused);
		await expect(asCaller(run)).rejects.toMatchObject({
			status: 409,
			body: { message: refused.message }
		});
	});

	it('lets any other failure through as it is', async () => {
		const broken = new Error('down');
		run.mockRejectedValue(broken);
		await expect(asCaller(run)).rejects.toBe(broken);
	});
});
