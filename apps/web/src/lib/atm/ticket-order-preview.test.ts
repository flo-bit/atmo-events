import { describe, expect, it } from 'vitest';
import { normalizeTicketOrderPreview } from './ticket-order-preview';

describe('ATM ticket order preview normalization', () => {
	it('normalizes a coherent quote', () => {
		expect(
			normalizeTicketOrderPreview({
				subtotalAmount: 5_000,
				buyerFeeAmount: 150,
				discountAmount: 1_000,
				totalAmount: 4_150,
				currency: 'USD',
				offerCode: ' summer ',
				offerLabel: ' Summer offer '
			})
		).toEqual({
			subtotalAmount: 5_000,
			buyerFeeAmount: 150,
			discountAmount: 1_000,
			totalAmount: 4_150,
			currency: 'usd',
			offerCode: 'SUMMER',
			offerLabel: 'Summer offer'
		});
	});

	it('rejects inconsistent or unsafe totals', () => {
		expect(() =>
			normalizeTicketOrderPreview({
				subtotalAmount: 5_000,
				buyerFeeAmount: 150,
				discountAmount: 1_000,
				totalAmount: 5_150,
				currency: 'usd'
			})
		).toThrow('inconsistent totals');
		expect(() =>
			normalizeTicketOrderPreview({
				subtotalAmount: -1,
				buyerFeeAmount: 0,
				discountAmount: 0,
				totalAmount: 0,
				currency: 'usd'
			})
		).toThrow('subtotalAmount');
	});
});
