import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail/queries.js', () => ({
	happeningNowQuery: vi.fn(async () => ({ events: [], handles: {}, cursor: null }))
}));
import { happeningNowQuery } from '#lib/contrail/queries.js';
import { nextCursor } from '#lib/contrail/cursor.js';
import { load } from './+page.server';
const run = (search = '') =>
	load({ url: new URL(`https://atmo.rsvp/events/now${search}`) } as Parameters<
		typeof load
	>[0]) as Promise<any>;
afterEach(() => vi.clearAllMocks());

describe('happening-now page', () => {
	it('uses the same database query for the page and its ongoing band', async () => {
		await run('?q=jazz');
		expect(happeningNowQuery).toHaveBeenCalledWith({}, undefined, {
			slug: undefined,
			search: 'jazz'
		});
	});
	it('resumes an unscoped cursor only for this query', async () => {
		await run(`?cursor=${nextCursor('happening-now', 'key')}`);
		expect(happeningNowQuery).toHaveBeenCalledWith({}, 'key', {
			slug: undefined,
			search: undefined
		});
	});
	it('does not resume inbound cursors for free text', async () => {
		const result = await run(`?q=jazz&cursor=${nextCursor('happening-now', 'key')}`);
		expect(happeningNowQuery).toHaveBeenCalledWith({}, undefined, {
			slug: undefined,
			search: 'jazz'
		});
		expect(result.term).toBe('jazz');
	});
	it('does not broaden unknown topic scopes to the whole network', async () => {
		const result = await run('?topic=not-a-topic');
		expect(result.events).toEqual([]);
		expect(happeningNowQuery).not.toHaveBeenCalled();
	});
	it('keeps a known topic bound to its continuation', async () => {
		const result = await run(
			`?topic=ai&cursor=${nextCursor('happening-now', 'key', { slug: 'ai' })}`
		);
		expect(happeningNowQuery).toHaveBeenCalledWith({}, 'key', { slug: 'ai', search: undefined });
		expect(result.slug).toBe('ai');
	});
});
