import { expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { load } from './+page.server';

it('keeps the private-events settings route unavailable when the upstream feature is disabled', () => {
	expect(() => load()).toThrow(expect.objectContaining({ status: 404 }));
	env.PRIVATE_EVENTS = 'true';
	expect(load()).toEqual({ pageTitle: 'Private event settings' });
});
