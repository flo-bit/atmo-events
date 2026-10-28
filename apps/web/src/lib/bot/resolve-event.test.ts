import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';

const { getEventRecordFromContrail, getPDS } = vi.hoisted(() => ({
	getEventRecordFromContrail: vi.fn(),
	getPDS: vi.fn(async () => 'https://pds.example')
}));
vi.mock('#lib/contrail.js', () => ({ getEventRecordFromContrail }));
vi.mock('@svelte-atproto/oauth/helper', () => ({ getPDS }));
import { loadEvent } from './resolve-event';

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('bot event RSVP preference', () => {
	it.each([undefined, true, false])(
		'preserves rsvpExpected=%s from the index',
		async (rsvpExpected) => {
			getEventRecordFromContrail.mockResolvedValue({
				uri: 'at://event',
				cid: 'cid',
				value: { rsvpExpected }
			});
			const result = await loadEvent({} as Client, 'did:plc:host', 'event');
			expect(result?.rsvpExpected).toBe(rsvpExpected);
		}
	);

	it('preserves an explicit false when falling back to the owner’s PDS', async () => {
		getEventRecordFromContrail.mockResolvedValue(null);
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							uri: 'at://event',
							cid: 'cid',
							value: { rsvpExpected: false }
						})
					)
			)
		);
		const result = await loadEvent({} as Client, 'did:plc:host', 'event');
		expect(result?.rsvpExpected).toBe(false);
		expect(getPDS).toHaveBeenCalledWith('did:plc:host');
	});
});
