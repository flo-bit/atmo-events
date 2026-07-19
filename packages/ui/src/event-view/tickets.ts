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

export type EventTicketingView = {
	/** ATM environment the data came from; `test` renders a badge. */
	environment: 'test' | 'live';
	tiers: TicketTierView[];
	viewerTickets: ViewerTicketView[];
	/** True right after checkout returned successfully (`?tickets=success`). */
	justPurchased: boolean;
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
