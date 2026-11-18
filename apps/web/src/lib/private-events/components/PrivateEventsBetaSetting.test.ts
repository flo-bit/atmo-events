import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const remote = vi.hoisted(() => ({ getPrivateEventsBeta: vi.fn(), setPrivateEventsBeta: vi.fn() }));
vi.mock('../private-events.remote', () => remote);
const { default: PrivateEventsBetaSetting } = await import('./PrivateEventsBetaSetting.svelte');

describe('the beta setting rendered on the server', () => {
	// On a Worker, a query started during the server render outlives the request, and the OAuth
	// session lock it takes never settles: every later request on that session hangs.
	it('starts no query', () => {
		const { body } = render(PrivateEventsBetaSetting);
		expect(remote.getPrivateEventsBeta).not.toHaveBeenCalled();
		expect(body).toContain('Loading…');
	});
});
