import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { EditorAdapter, EditorViewer } from '@atmo-dev/events-ui/editor/adapter.js';
// Exercise the pending workspace source instead of potentially stale packaged output.
import EventAttendanceActions from '../../../../packages/ui/src/event-view/EventAttendanceActions.svelte';

const ticketUrl = 'https://events.atmosphere.tickets/p/did:plc:abc/e/3mrdbziccpcah';
const externalRsvpUrl = 'https://events.example/rsvp';

const adapter: EditorAdapter = {
	features: { delete: true, recurring: true, privateMode: true },
	putRecord: async () => ({ uri: 'at://did:plc:viewer/community.lexicon.calendar.rsvp/rsvp' }),
	createRecord: async () => ({ uri: 'at://did:plc:viewer/test.record/rkey' }),
	deleteRecord: async () => {},
	uploadBlob: async () => ({
		$type: 'blob',
		ref: { $link: 'bafkreiexample' },
		mimeType: 'image/png',
		size: 1
	}),
	getRecord: async () => ({ value: {} }),
	resolveHandle: async () => 'did:plc:viewer',
	onSaved: () => {},
	requestLogin: () => {}
};

const signedOutViewer: EditorViewer = { isLoggedIn: false, did: null };
const signedInViewer: EditorViewer = {
	isLoggedIn: true,
	did: 'did:plc:viewer',
	handle: 'viewer.test'
};

function renderActions(
	props: Partial<Parameters<typeof render<typeof EventAttendanceActions>>[1]['props']> = {}
) {
	return render(EventAttendanceActions, {
		props: {
			ticketUrl,
			showRsvpPanel: false,
			eventUri: 'at://did:plc:abc/community.lexicon.calendar.event/3mrdbziccpcah',
			adapter,
			viewer: signedOutViewer,
			...props
		}
	}).body;
}

describe('ticket-aware attendance actions', () => {
	it('shows only the ticket action to a signed-out viewer of the pilot ticketed event', () => {
		const body = renderActions({
			ticketAdmissionRequired: true,
			rsvpExternalOnly: true,
			externalSourceUrl: externalRsvpUrl
		});

		expect(body).toContain('Buy tickets');
		expect(body).toContain(`href="${ticketUrl}"`);
		expect(body).not.toContain('Log in to RSVP');
		expect(body).not.toContain('RSVP on the original page');
		expect(body).not.toContain(externalRsvpUrl);
	});

	it('keeps a signed-out required event actionable when discovery is unavailable', () => {
		const body = renderActions({
			ticketUrl: undefined,
			ticketAdmissionRequired: true
		});

		expect(body).toContain('This is a ticketed event');
		expect(body).toContain(
			'Ticket information is temporarily unavailable. Please refresh in a few minutes.'
		);
		expect(body).toContain('role="status"');
		expect(body).not.toContain('Try again');
		expect(body).not.toContain('Log in to RSVP');
	});

	it('renders no ticket or RSVP actions after a required event closes', () => {
		const body = renderActions({
			ticketAdmissionRequired: true,
			ticketActionState: 'closed',
			showRsvpPanel: true,
			viewer: signedInViewer
		});

		expect(body).not.toContain('Buy tickets');
		expect(body).not.toContain('Ticket information is temporarily unavailable.');
		expect(body).not.toContain('Try again');
		expect(body).not.toContain('Going');
		expect(body).not.toContain('Interested');
	});

	it.each([
		['going', "You're Going"],
		['interested', "You're Interested"]
	] as const)(
		'preserves an authenticated external %s RSVP beside the ticket action',
		(status, copy) => {
			const body = renderActions({
				showRsvpPanel: true,
				ticketAdmissionRequired: true,
				viewer: signedInViewer,
				initialRsvpStatus: status,
				initialRsvpRkey: 'external-rsvp'
			});

			expect(body).toContain('Buy tickets');
			expect(body).toContain(copy);
			expect(body).toContain('This is a ticketed event');
			expect(body).toContain('Remove');
			expect(body).toContain('sm:flex-row');
		}
	);

	it('keeps new Going behind the ticket flow while leaving Interested available', () => {
		const body = renderActions({
			showRsvpPanel: true,
			ticketAdmissionRequired: true,
			viewer: signedInViewer
		});

		expect(body).toContain('This is a ticketed event');
		expect(body).not.toContain('This event requires a ticket');
		expect(body).toContain('Buy tickets');
		expect(body).toContain('Respond as');
		expect(body).toContain('viewer.test');
		expect(body).toContain('Interested');
		expect(body).not.toContain('Attend as');
		expect(body).not.toContain('Going');
		expect(body.match(/Buy tickets/g)).toHaveLength(1);
	});

	it('keeps Interested and honest status copy when signed-in discovery is unavailable', () => {
		const body = renderActions({
			ticketUrl: undefined,
			showRsvpPanel: true,
			ticketAdmissionRequired: true,
			viewer: signedInViewer
		});

		expect(body).toContain('This is a ticketed event');
		expect(body).toContain(
			'Ticket information is temporarily unavailable. Please refresh in a few minutes.'
		);
		expect(body).toContain('role="status"');
		expect(body).not.toContain('Try again');
		expect(body).toContain('Respond as');
		expect(body).not.toContain('Attend as');
		expect(body).toContain('Interested');
		expect(body).not.toContain('Going');
		expect(body).not.toContain('h-25');
	});

	it('fails closed when a ticket URL points to a different event', () => {
		const body = renderActions({
			ticketUrl: 'https://events.atmosphere.tickets/p/did:plc:abc/e/another-event',
			showRsvpPanel: true,
			ticketAdmissionRequired: true,
			viewer: signedInViewer
		});

		expect(body).not.toContain('href="https://events.atmosphere.tickets');
		expect(body).toContain('Ticket information is temporarily unavailable.');
		expect(body).not.toContain('Try again');
		expect(body).toContain('Interested');
		expect(body).not.toContain('Going');
	});

	it('falls back to ordinary RSVP when public event timing is unknown', () => {
		const body = renderActions({
			ticketUrl: undefined,
			ticketAdmissionRequired: true,
			ticketActionState: 'unknown',
			showRsvpPanel: true,
			viewer: signedInViewer
		});

		expect(body).not.toContain('This is a ticketed event');
		expect(body).not.toContain('Ticket information is temporarily unavailable.');
		expect(body).toContain('Attend as');
		expect(body).toContain('Going');
		expect(body).toContain('Interested');
	});

	it('keeps ticket discovery additive when admission is not required', () => {
		const body = renderActions({
			showRsvpPanel: true,
			ticketAdmissionRequired: false,
			viewer: signedInViewer
		});

		expect(body).toContain('This is a ticketed event');
		expect(body).toContain('Buy tickets');
		expect(body).toContain('Going');
		expect(body).toContain('Interested');
	});

	it('keeps the ordinary Going and Interested controls for a non-ticketed event', () => {
		const body = renderActions({
			ticketUrl: undefined,
			showRsvpPanel: true,
			viewer: signedInViewer
		});

		expect(body).not.toContain('Buy tickets');
		expect(body).toContain('Attend as');
		expect(body).toContain('Going');
		expect(body).toContain('Interested');
	});

	it('does not let an external RSVP route bypass required-ticket presentation', () => {
		const body = renderActions({
			showRsvpPanel: true,
			ticketAdmissionRequired: true,
			viewer: signedInViewer,
			rsvpExternalOnly: true,
			externalSourceUrl: externalRsvpUrl
		});

		expect(body).toContain('Buy tickets');
		expect(body).toContain('Interested');
		expect(body).not.toContain('Going');
		expect(body).not.toContain('RSVP on the original page');
		expect(body).not.toContain(externalRsvpUrl);
	});

	it('retains an organizer-configured external RSVP route when admission is optional', () => {
		const body = renderActions({
			showRsvpPanel: true,
			ticketAdmissionRequired: false,
			viewer: signedInViewer,
			rsvpExternalOnly: true,
			externalSourceUrl: externalRsvpUrl
		});

		expect(body).toContain('Buy tickets');
		expect(body).toContain('RSVP on the original page');
		expect(body).toContain(`href="${externalRsvpUrl}"`);
	});
});
