import type { TicketOrderPreviewView } from '@atmo-dev/events-ui';
import type { AtmTicketOrderPreviewResult } from './sdk';

/** Fail closed if a broker response cannot be rendered as a coherent total. */
export function normalizeTicketOrderPreview(
	result: AtmTicketOrderPreviewResult
): TicketOrderPreviewView {
	const subtotalAmount = moneyAmount(result.subtotalAmount, 'subtotalAmount');
	const buyerFeeAmount = moneyAmount(result.buyerFeeAmount, 'buyerFeeAmount');
	const discountAmount = moneyAmount(result.discountAmount, 'discountAmount');
	const totalAmount = moneyAmount(result.totalAmount, 'totalAmount');
	const currency = typeof result.currency === 'string' ? result.currency.trim().toLowerCase() : '';
	if (!currency) throw new Error('ATM ticket preview did not include a currency');
	if (subtotalAmount + buyerFeeAmount - discountAmount !== totalAmount) {
		throw new Error('ATM ticket preview returned inconsistent totals');
	}

	const offerCode =
		typeof result.offerCode === 'string' ? result.offerCode.trim().toUpperCase() : '';
	const offerLabel = typeof result.offerLabel === 'string' ? result.offerLabel.trim() : '';
	return {
		subtotalAmount,
		buyerFeeAmount,
		discountAmount,
		totalAmount,
		currency,
		...(offerCode ? { offerCode } : {}),
		...(offerLabel ? { offerLabel } : {})
	};
}

function moneyAmount(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error(`ATM ticket preview ${field} must be a non-negative integer`);
	}
	return value as number;
}
