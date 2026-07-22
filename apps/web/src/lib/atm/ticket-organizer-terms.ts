import type { OrganizerTicketTermsView } from '@atmo-dev/events-ui';

export type OrganizerTermsAcceptanceMetadata = {
	organizerTermsAccepted: true;
	organizerTermsUrl: string;
	organizerTermsVersion: string;
	organizerTermsLabel?: string;
};

export type OrganizerTermsAcceptanceResult =
	| { ok: true; metadata?: OrganizerTermsAcceptanceMetadata }
	| { ok: false; reason: 'acceptance-required' | 'version-mismatch' };

/**
 * Resolve a client decision against terms loaded from ATM on the server.
 * The browser submits only the version it actually displayed. The server binds
 * that decision to a fresh ATM projection and snapshots the server-owned terms;
 * a stale or removed version can never silently authorize checkout.
 */
export function resolveOrganizerTermsAcceptance(
	serverTerms: OrganizerTicketTermsView | undefined,
	clientAccepted: boolean | undefined,
	clientVersion: string | undefined
): OrganizerTermsAcceptanceResult {
	if (!serverTerms) {
		return clientVersion ? { ok: false, reason: 'version-mismatch' } : { ok: true };
	}
	if (clientVersion !== serverTerms.version) return { ok: false, reason: 'version-mismatch' };
	if (clientAccepted !== true) return { ok: false, reason: 'acceptance-required' };
	return {
		ok: true,
		metadata: {
			organizerTermsAccepted: true,
			organizerTermsUrl: serverTerms.url,
			organizerTermsVersion: serverTerms.version,
			...(serverTerms.label ? { organizerTermsLabel: serverTerms.label } : {})
		}
	};
}
