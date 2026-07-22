import { describe, expect, it } from 'vitest';
import { resolveOrganizerTermsAcceptance } from './ticket-organizer-terms';

describe('organizer ticket terms enforcement', () => {
	it('does not gate an event without organizer terms', () => {
		expect(resolveOrganizerTermsAcceptance(undefined, undefined, undefined)).toEqual({ ok: true });
	});

	it('accepts only an explicit true decision for the displayed server version', () => {
		const terms = {
			url: 'https://organizer.example/terms',
			label: 'Attendance terms',
			version: 'terms-v3'
		};
		expect(resolveOrganizerTermsAcceptance(terms, undefined, 'terms-v3')).toEqual({
			ok: false,
			reason: 'acceptance-required'
		});
		expect(resolveOrganizerTermsAcceptance(terms, false, 'terms-v3')).toEqual({
			ok: false,
			reason: 'acceptance-required'
		});
		expect(resolveOrganizerTermsAcceptance(terms, true, 'terms-v2')).toEqual({
			ok: false,
			reason: 'version-mismatch'
		});
		expect(resolveOrganizerTermsAcceptance(terms, true, 'terms-v3')).toEqual({
			ok: true,
			metadata: {
				organizerTermsAccepted: true,
				organizerTermsUrl: 'https://organizer.example/terms',
				organizerTermsVersion: 'terms-v3',
				organizerTermsLabel: 'Attendance terms'
			}
		});
	});

	it('rejects a stale browser version even when current terms were removed', () => {
		expect(resolveOrganizerTermsAcceptance(undefined, true, 'terms-v2')).toEqual({
			ok: false,
			reason: 'version-mismatch'
		});
	});
});
