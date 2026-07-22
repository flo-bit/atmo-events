type TicketingWithViewerTickets =
	| {
			viewerTickets?: Array<{ status?: string }>;
	  }
	| null
	| undefined;

export type TicketCheckoutReturn = {
	kind: 'success' | 'cancelled';
	checkoutToken: string;
};

export type TicketPurchaseReturnAction = 'confirmed' | 'processing' | 'clear' | 'none';

/**
 * Convert an ATM-verified payment status into UI/cookie behavior. Return query
 * syntax can choose neutral pending vs cancellation cleanup, but can never
 * create a confirmed result without ATM's `completed` status.
 */
export function ticketPurchaseReturnAction(
	paymentStatus: unknown,
	returnKind: TicketCheckoutReturn['kind']
): TicketPurchaseReturnAction {
	if (paymentStatus === 'completed') return 'confirmed';
	if (paymentStatus === 'failed') return 'clear';
	if (returnKind === 'cancelled') return 'clear';
	if (paymentStatus === 'pending') return 'processing';
	return 'none';
}

/**
 * Parse ATM's return shape. This validates syntax only: callers must match the
 * token to a signed HTTP-only intent and query ATM before trusting its status.
 */
export function parseTicketCheckoutReturn(url: URL): TicketCheckoutReturn | null {
	const marker = url.searchParams.get('tickets');
	const status = url.searchParams.get('status');
	const checkoutToken = url.searchParams.get('session')?.trim();
	if (!checkoutToken) return null;
	if (marker === 'success' && status === 'success') return { kind: 'success', checkoutToken };
	if (marker === 'cancelled' && status === 'cancelled') {
		return { kind: 'cancelled', checkoutToken };
	}
	return null;
}

/** ATM adds the checkout token and matching terminal status on app return. */
export function isTicketCheckoutReturn(url: URL): boolean {
	return parseTicketCheckoutReturn(url) !== null;
}

/** Strip malformed/partial return parameters too, so bearer tokens never render into a page URL. */
export function hasTicketCheckoutReturnParams(url: URL): boolean {
	const marker = url.searchParams.get('tickets');
	return (
		marker === 'success' ||
		marker === 'cancelled' ||
		url.searchParams.has('session') ||
		(url.searchParams.has('status') && url.searchParams.has('rsvp'))
	);
}

/** Only an active ATM-issued ticket is strong enough to trigger an automatic RSVP. */
export function hasActiveViewerTicket(ticketing: TicketingWithViewerTickets): boolean {
	return ticketing?.viewerTickets?.some((ticket) => ticket.status === 'active') ?? false;
}

/** Remove the bearer checkout token and one-shot return markers from browser history. */
export function ticketReturnUrlWithoutCheckoutParams(url: URL): string {
	const clean = new URL(url);
	clean.searchParams.delete('tickets');
	clean.searchParams.delete('session');
	clean.searchParams.delete('status');
	clean.searchParams.delete('rsvp');
	return `${clean.pathname}${clean.search}${clean.hash}`;
}
