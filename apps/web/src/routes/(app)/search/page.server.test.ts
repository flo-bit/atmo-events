import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail/queries.js', () => ({
	EMPTY_PAGE: { events: [], handles: {}, cursor: null },
	searchD1Query: vi.fn(async () => ({ events: [], handles: {}, cursor: 'next' }))
}));
vi.mock('#lib/contrail/ongoing.js', async (actual) => ({
	...(await actual<typeof import('#lib/contrail/ongoing.js')>()),
	ongoingQuery: vi.fn(async () => ({ events: [], handles: {}, total: 0, totalIsFloor: false }))
}));
import { load } from './+page.server';
import { searchD1Query } from '#lib/contrail/queries.js';
import { ongoingQuery } from '#lib/contrail/ongoing.js';
const run = (search: string) =>
	load({ url: new URL(`https://atmo.rsvp/search${search}`) } as Parameters<
		typeof load
	>[0]) as Promise<any>;
afterEach(() => vi.clearAllMocks());

describe('database-backed search', () => {
	it('does not query for an empty term', async () => {
		const result = await run('');
		expect(result.events).toEqual([]);
		expect(result.query).toBe('');
		expect(searchD1Query).not.toHaveBeenCalled();
		expect(ongoingQuery).not.toHaveBeenCalled();
		expect('locationSearchAvailable' in result).toBe(false);
	});
	it('searches upcoming and ongoing events with the same trimmed term', async () => {
		const result = await run('?q=%20jazz%20&cursor=untrusted');
		expect(searchD1Query).toHaveBeenCalledWith({}, { term: 'jazz' }, null);
		expect(ongoingQuery).toHaveBeenCalledWith({}, { term: 'jazz' });
		expect(result.query).toBe('jazz');
		expect(result.cursor).toBe('next');
	});
});
