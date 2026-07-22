import type {
	OrganizerTicketTermsView,
	TicketOrderPreviewView,
	TicketTierView
} from './tickets.js';

export type TicketPurchaseSelection = {
	tierId: string;
	quantity: number;
	offerCode?: string;
};

export type TicketPurchaseIntentSelection = TicketPurchaseSelection & {
	organizerTermsVersion?: string;
};

export type TicketPurchaseIntent = {
	selectionKey: string;
	intentId: string;
};

export const TICKET_PREVIEW_DEBOUNCE_MS = 300;
export const TICKET_PREVIEW_TIMEOUT_MS = 9_000;

export type AppliedTicketOrderPreview = TicketOrderPreviewView & {
	/** Binds the quote to the exact tier, quantity, and normalized code it priced. */
	selectionKey: string;
};

export type TicketPurchasePriceSummary = {
	subtotalAmount: number;
	buyerFeeAmount: number;
	discountAmount: number;
	totalAmount: number;
	currency?: string;
	offerLabel?: string;
	/** False while the UI is showing the local tier-price fallback. */
	authoritative: boolean;
};

export function normalizeTicketOfferCode(value: string | undefined): string | undefined {
	const normalized = value?.trim().toUpperCase();
	return normalized || undefined;
}

export function ticketPurchaseSelectionKey(selection: TicketPurchaseSelection): string {
	return JSON.stringify([
		selection.tierId,
		selection.quantity,
		normalizeTicketOfferCode(selection.offerCode) ?? null
	]);
}

/**
 * Idempotency scope for a purchase attempt. Terms are included even though
 * they do not affect the price: changing the consent revision must always
 * mint a new purchase intent.
 */
export function ticketPurchaseIntentSelectionKey(selection: TicketPurchaseIntentSelection): string {
	return JSON.stringify([
		selection.tierId,
		selection.quantity,
		normalizeTicketOfferCode(selection.offerCode) ?? null,
		selection.organizerTermsVersion?.trim() || null
	]);
}

/** Reuse one intent for transport/user retries; mint a new one after any selection change. */
export function resolveStableTicketPurchaseIntent(
	previous: TicketPurchaseIntent | null | undefined,
	selection: TicketPurchaseIntentSelection,
	mint: () => string
): TicketPurchaseIntent {
	const selectionKey = ticketPurchaseIntentSelectionKey(selection);
	if (previous?.selectionKey === selectionKey) return previous;
	return { selectionKey, intentId: mint() };
}

/**
 * Attach an ATM preview to the exact inputs that produced it. Components must
 * discard it whenever this key stops matching; a previous quote must never be
 * displayed or submitted for a changed quantity/code.
 */
export function bindTicketOrderPreview(
	selection: TicketPurchaseSelection,
	preview: TicketOrderPreviewView
): AppliedTicketOrderPreview {
	assertMoneyAmount(preview.subtotalAmount, 'subtotalAmount');
	assertMoneyAmount(preview.buyerFeeAmount, 'buyerFeeAmount');
	assertMoneyAmount(preview.discountAmount, 'discountAmount');
	assertMoneyAmount(preview.totalAmount, 'totalAmount');
	if (!preview.currency.trim()) throw new Error('Ticket preview currency is required');

	return {
		...preview,
		currency: preview.currency.toLowerCase(),
		offerCode: normalizeTicketOfferCode(preview.offerCode),
		selectionKey: ticketPurchaseSelectionKey(selection)
	};
}

export function isTicketOrderPreviewCurrent(
	preview: AppliedTicketOrderPreview | null | undefined,
	selection: TicketPurchaseSelection
): preview is AppliedTicketOrderPreview {
	return preview?.selectionKey === ticketPurchaseSelectionKey(selection);
}

/** An offer code is usable only when ATM has successfully priced that exact code. */
export function ticketOfferNeedsVerifiedPreview(
	selection: TicketPurchaseSelection,
	preview: AppliedTicketOrderPreview | null | undefined
): boolean {
	const offerCode = normalizeTicketOfferCode(selection.offerCode);
	if (!offerCode) return false;
	return !(
		preview &&
		isTicketOrderPreviewCurrent(preview, selection) &&
		normalizeTicketOfferCode(preview.offerCode) === offerCode
	);
}

/** Bound a remote preview so a stalled request cannot leave the picker spinning forever. */
export async function withTicketPreviewTimeout<T>(
	request: Promise<T>,
	timeoutMs = TICKET_PREVIEW_TIMEOUT_MS
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			request,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(
					() => reject(new Error('Ticket pricing took too long — please retry.')),
					timeoutMs
				);
			})
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

/**
 * Prefer ATM's complete price quote. Until it arrives, show a deterministic
 * subtotal/total derived from the public tier price and clearly mark it as
 * non-authoritative so checkout controls can wait if desired.
 */
export function ticketPurchasePriceSummary(
	tier: TicketTierView,
	selection: TicketPurchaseSelection,
	preview?: AppliedTicketOrderPreview | null
): TicketPurchasePriceSummary {
	const safeQuantity =
		Number.isInteger(selection.quantity) && selection.quantity > 0 ? selection.quantity : 1;
	if (
		selection.tierId === tier.tierId &&
		preview &&
		isTicketOrderPreviewCurrent(preview, selection) &&
		(!tier.currency || preview.currency.toLowerCase() === tier.currency.toLowerCase())
	) {
		return {
			subtotalAmount: preview.subtotalAmount,
			buyerFeeAmount: preview.buyerFeeAmount,
			discountAmount: preview.discountAmount,
			totalAmount: preview.totalAmount,
			currency: preview.currency,
			offerLabel: preview.offerLabel,
			authoritative: true
		};
	}

	const subtotalAmount = Math.max(0, tier.unitAmount ?? 0) * safeQuantity;
	return {
		subtotalAmount,
		buyerFeeAmount: 0,
		discountAmount: 0,
		totalAmount: subtotalAmount,
		currency: tier.currency,
		authoritative: false
	};
}

/** Organizer terms are the only acceptance gate owned by the app picker. */
export function hasAcceptedOrganizerTicketTerms(
	terms: OrganizerTicketTermsView | undefined,
	accepted: boolean
): boolean {
	return !terms || accepted;
}

function assertMoneyAmount(value: number, field: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`Ticket preview ${field} must be a non-negative integer`);
	}
}
