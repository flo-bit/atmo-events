import { describe, expect, it } from 'vitest';
import { error } from '@sveltejs/kit';
import { reportErrorMessage, reportSubjectUrl, type ReportSubject } from './reporting';

const account: ReportSubject = {
	$type: 'com.atproto.admin.defs#repoRef',
	did: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
};
const event: ReportSubject = {
	$type: 'com.atproto.repo.strongRef',
	uri: `at://${account.did}/community.lexicon.calendar.event/meetup`,
	cid: 'bafytest'
};

function httpError(status: number, message: string) {
	try {
		error(status, message);
	} catch (cause) {
		return cause;
	}
}

describe('report subject links', () => {
	it('links to the canonical account or event', () => {
		expect(reportSubjectUrl(account)).toBe(
			`https://atmo.rsvp/p/${encodeURIComponent(account.did)}`
		);
		expect(reportSubjectUrl(event)).toBe(
			`https://atmo.rsvp/p/${encodeURIComponent(account.did)}/e/meetup`
		);
	});
});

describe('report errors', () => {
	it('reads SvelteKit HTTP errors, which are not Error instances', () => {
		const cause = httpError(400, 'Subject is not indexed by this service');
		expect(cause).not.toBeInstanceOf(Error);
		expect(reportErrorMessage(cause)).toBe('Subject is not indexed by this service');
	});
	it('prompts for a fresh session after a 401', () => {
		expect(reportErrorMessage(httpError(401, 'Unauthorized'))).toContain('Sign in again');
	});
	it('explains rate limits', () => {
		expect(reportErrorMessage(httpError(429, 'RateLimitExceeded'))).toContain(
			'Try again in an hour'
		);
	});
	it('does not expose internal server messages', () => {
		expect(reportErrorMessage(httpError(500, 'Private database details'))).toBe(
			'Reporting is unavailable right now. Try again or report by email.'
		);
	});
	it('handles network errors and unknown rejection values', () => {
		expect(reportErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
		expect(reportErrorMessage(null)).toContain('report by email');
	});
});
