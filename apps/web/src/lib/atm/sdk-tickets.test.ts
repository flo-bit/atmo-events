import { describe, expect, it, vi } from 'vitest';
import {
	ATM_XRPC_METHODS,
	createAtmAppClient,
	createFreeTicketClaimBody,
	createTicketHoldBody
} from './sdk';

const BUYER_DID = 'did:plc:abcdefghijklmnopqrstuvwxyz';

describe('vendored ATM ticket request builders', () => {
	it('uses the current item-array contract for free claims', () => {
		const body = createFreeTicketClaimBody({
			eventUri:
				'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
			buyerDid: BUYER_DID,
			buyerAssertionJwt: 'assertion.jwt',
			items: [{ tierId: 'tier-free', quantity: 2 }],
			idempotencyKey: 'atmo-rsvp:intent-123456'
		});

		expect(body.items).toEqual([{ tierId: 'tier-free', quantity: 2 }]);
		expect(body).not.toHaveProperty('tierId');
	});

	it('rejects empty and invalid free-claim item arrays', () => {
		expect(() =>
			createFreeTicketClaimBody({
				buyerDid: BUYER_DID,
				buyerAssertionJwt: 'assertion.jwt',
				items: []
			})
		).toThrow('at least one item');

		expect(() =>
			createFreeTicketClaimBody({
				buyerDid: BUYER_DID,
				buyerAssertionJwt: 'assertion.jwt',
				items: [{ tierId: 'tier-free', quantity: 0 }]
			})
		).toThrow('positive integer');
	});

	it('keeps an offer code on a paid hold request', () => {
		const body = createTicketHoldBody({
			eventUri:
				'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
			offerCode: 'FRIENDS20',
			items: [{ tierId: 'tier-paid', quantity: 1 }],
			idempotencyKey: 'atmo-rsvp:intent-654321'
		});

		expect(body.offerCode).toBe('FRIENDS20');
		expect(body.items).toEqual([{ tierId: 'tier-paid', quantity: 1 }]);
	});

	it('calls the app-authenticated, non-reserving ticket preview query', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					subtotalAmount: 2_000,
					buyerFeeAmount: 60,
					discountAmount: 200,
					totalAmount: 1_860,
					currency: 'usd',
					offerCode: 'SAVE10'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		try {
			const client = createAtmAppClient({
				brokerUrl: 'https://checkout.atmosphere.money',
				getServiceAuthToken: async ({ lxm }) => `token-for:${lxm}`
			});
			const result = await client.previewTicketOrder({
				environment: 'test',
				eventUri:
					'at://did:plc:abcdefghijklmnopqrstuvwxyz/community.lexicon.calendar.event/summer-party',
				tierId: 'tier-paid',
				quantity: 1,
				offerCode: 'SAVE10'
			});

			expect(result.totalAmount).toBe(1_860);
			const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
			expect(requestUrl.pathname).toBe(`/xrpc/${ATM_XRPC_METHODS.tickets.previewTicketOrder}`);
			expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
				method: 'POST',
				headers: {
					authorization: `Bearer token-for:${ATM_XRPC_METHODS.tickets.previewTicketOrder}`
				},
				body: expect.stringContaining('"offerCode":"SAVE10"')
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
