import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
vi.mock('#lib/contrail.js', () => ({ notifyContrailOfUpdate: vi.fn() }));
import EmbedPage from './+page.svelte';

function markup(
	rsvpExpected?: boolean,
	viewerDid: string | null = null,
	viewerRsvpStatus: 'going' | 'interested' | 'notgoing' | null = null
) {
	return render(EmbedPage, {
		props: {
			data: {
				canPostToBluesky: false,
				did: null,
				profile: null,
				pageTitle: 'Meetup',
				eventData: {
					name: 'Meetup',
					startsAt: '2099-10-24T18:00:00Z',
					rsvpExpected,
					createdAt: '2026-10-01T12:00:00Z',
					did: 'did:plc:host',
					rkey: 'event',
					uri: 'at://did:plc:host/community.lexicon.calendar.event/event'
				},
				actorDid: 'did:plc:host',
				rkey: 'event',
				eventUri: 'at://did:plc:host/community.lexicon.calendar.event/event',
				eventCid: null,
				hostProfile: null,
				thumbnailUrl: null,
				viewerDid,
				viewerRsvpStatus,
				viewerRsvpRkey: viewerRsvpStatus ? 'existing-rsvp' : null
			}
		}
	}).body;
}

describe('compact embed RSVP requests', () => {
	it.each([null, 'did:plc:viewer'])(
		'hides RSVP controls for explicit false (viewer: %s)',
		(viewerDid) => {
			const html = markup(false, viewerDid);
			expect(html).not.toContain('Log in to RSVP');
			expect(html).not.toContain('>Going</button>');
			expect(html).not.toContain('aria-label="Interested"');
		}
	);
	it.each([undefined, true])('keeps login and RSVP controls for %s', (rsvpExpected) => {
		expect(markup(rsvpExpected)).toContain('Log in to RSVP');
		expect(markup(rsvpExpected, 'did:plc:viewer')).toContain('aria-label="Interested"');
	});
	it.each(['going', 'interested', 'notgoing'] as const)(
		'still offers cancellation for an existing %s RSVP',
		(status) => {
			const html = markup(false, 'did:plc:viewer', status);
			expect(html).toContain('aria-label="Cancel RSVP"');
			expect(html).not.toContain('onclick={() => submitRsvp');
		}
	);
});
