import type { AtmTicketSummary } from './sdk';

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

export function ticketEventUri(ticket: AtmTicketSummary): string | undefined {
	return (
		stringValue(ticket.event?.uri) ??
		stringValue(ticket.presentation?.event?.uri) ??
		stringValue(ticket.eventUri)
	);
}

/**
 * Build the minimal, non-secret calendar decoration from ATM's private ticket
 * response. Scan/pass URLs are deliberately discarded here.
 */
export function buildViewerTicketBadges(
	tickets: AtmTicketSummary[],
	fallbackIconUrl: string
): Record<string, string> {
	const badges: Record<string, string> = {};
	for (const ticket of tickets) {
		if (ticket.status !== 'active') continue;
		const eventUri = ticketEventUri(ticket);
		if (!eventUri) continue;
		badges[eventUri] = stringValue(ticket.presentation?.iconUrl) ?? fallbackIconUrl;
	}
	return badges;
}
