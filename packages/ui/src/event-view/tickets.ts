// Atmosphere Tickets (ATM) — display types for the event page's tickets
// section. The shapes mirror ATM's `tickets.atmosphere.getTicketAvailability`
// and `tickets.atmosphere.listBuyerTickets` responses, trimmed to what the UI
// renders; the app's server load builds them (apps/web/src/lib/atm).

export type TicketTierView = {
	tierId: string;
	title: string;
	description?: string;
	/** Lowercase ISO 4217 currency code (e.g. `usd`). */
	currency?: string;
	/** Price in the currency's smallest unit; 0/undefined renders as free. */
	unitAmount?: number;
	/** `available` | `sold-out` | `not-on-sale` | `unavailable` (hidden tiers are filtered out server-side). */
	status: string;
	availableQuantity: number;
	maxPerOrder: number;
	/** Optional UTC sale window supplied by ATM. */
	saleStartsAt?: string;
	saleEndsAt?: string;
};

export type ViewerTicketView = {
	id: string;
	ticketNumber: string;
	/** `active` | `voided` | `refunded`. */
	status: string;
	tierTitle?: string;
	/** ATM-hosted pass page (QR code + live ticket state), when available. */
	scanUrl?: string;
};

/** Optional terms supplied by the event organizer, not ATM platform terms. */
export type OrganizerTicketTermsView = {
	url: string;
	/** Opaque ATM revision. Acceptance is valid only for this exact version. */
	version: string;
	/** Organizer-defined link label; clients provide a plain-language fallback. */
	label?: string;
};

/** Authoritative, non-reserving price preview returned by ATM. */
export type TicketOrderPreviewView = {
	subtotalAmount: number;
	buyerFeeAmount: number;
	discountAmount: number;
	totalAmount: number;
	currency: string;
	offerCode?: string;
	offerLabel?: string;
};

export type EventTicketingView = {
	/** ATM environment the data came from; `test` renders a badge. */
	environment: 'test' | 'live';
	/** Atmosphere Tickets brand mark served by the configured ATM instance. */
	iconUrl?: string;
	/** When present, acceptance is required before the app starts checkout. */
	organizerTerms?: OrganizerTicketTermsView;
	/** Fail-closed projection when ATM supplied terms that cannot be safely version-bound. */
	organizerTermsError?: string;
	tiers: TicketTierView[];
	viewerTickets: ViewerTicketView[];
	/**
	 * One-shot server-verified checkout state. It is never derived directly
	 * from browser query parameters.
	 */
	purchaseStatus?: 'processing' | 'confirmed';
};

// Currencies whose smallest unit is the whole unit (no minor-unit scaling).
const ZERO_DECIMAL_CURRENCIES = new Set([
	'bif',
	'clp',
	'djf',
	'gnf',
	'jpy',
	'kmf',
	'krw',
	'mga',
	'pyg',
	'rwf',
	'ugx',
	'vnd',
	'vuv',
	'xaf',
	'xof',
	'xpf'
]);

/** Format a minor-unit ticket price for display; 0/unset renders as "Free". */
export function formatTicketPrice(
	unitAmount: number | undefined,
	currency: string | undefined
): string {
	if (!unitAmount) return 'Free';
	if (!currency) return String(unitAmount);
	const amount = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
		? unitAmount
		: unitAmount / 100;
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: currency.toUpperCase()
		}).format(amount);
	} catch {
		return `${amount} ${currency.toUpperCase()}`;
	}
}
