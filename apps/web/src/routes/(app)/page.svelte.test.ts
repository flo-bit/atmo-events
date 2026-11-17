import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { FlatEventRecord } from '#lib/contrail.js';

const { user } = vi.hoisted(() => ({
	user: { isLoggedIn: true, did: 'did:plc:mememememememememememememe', profile: null }
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user, logout: vi.fn() }));

import HomePage from './+page.svelte';
import { privateNoteId } from '#lib/private-events/describe-link.js';

const event = (uri: string, name: string): FlatEventRecord => ({
	uri,
	did: 'did:plc:host',
	rkey: uri.split('/').at(-1)!,
	name,
	startsAt: '2099-07-01T12:00:00Z',
	createdAt: '2026-06-01T00:00:00Z'
});
const DINNER = event(
	'at://did:plc:host/space/community.lexicon.calendar.collection/3ldinner/did:plc:host/community.lexicon.calendar.event/3ldinner',
	'Dinner'
);
const PICNIC = event('at://did:plc:host/community.lexicon.calendar.event/3lpicnic', 'Picnic');

function markup(
	privateLinks: Record<string, { href: string }>,
	{ incomplete = false, mine = [DINNER, PICNIC] } = {}
) {
	return render(HomePage, {
		props: {
			data: {
				events: [],
				handles: {},
				myUpcoming: mine,
				myPast: [],
				privateLinks,
				privateEventsIncomplete: incomplete,
				recentActivity: [],
				recentActivityIsPersonalized: false
			} as never
		}
	}).body;
}

/** The markup as text reads: no hydration markers, and runs of white space as one space. */
const shown = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/\s+/g, ' ');

describe('Your events on the home page', () => {
	it('marks a private event with a lock line and links it to its own page', () => {
		const body = markup({ [DINNER.uri]: { href: '/p/host.example.com/private/3ldinner' } });
		expect(body.match(/data-testid="your-private-event"/g)).toHaveLength(1);
		expect(body).toContain('href="/p/host.example.com/private/3ldinner"');
		expect(shown(body)).toContain('Private event');
		expect(body).toContain('Picnic');
	});

	it('draws public events as before, with no lock', () => {
		const body = markup({});
		expect(body).not.toContain('your-private-event');
		expect(body).toContain('Dinner');
		expect(body).toContain('Picnic');
	});

	it('gives each lock line its own id, for the card’s link to point at', () => {
		const body = markup({ [DINNER.uri]: { href: '/p/host.example.com/private/3ldinner' } });
		expect(body).toContain(`id="${privateNoteId(DINNER.uri)}"`);
		expect(privateNoteId(DINNER.uri)).toMatch(/^[A-Za-z][\w-]*$/);
		expect(privateNoteId(PICNIC.uri)).not.toBe(privateNoteId(DINNER.uri));
	});

	it('says when some of their private events may be missing', () => {
		const body = markup({}, { incomplete: true });
		expect(body).toContain('data-testid="your-private-events-incomplete"');
	});

	it('says it even when there is nothing else to list', () => {
		const body = markup({}, { incomplete: true, mine: [] });
		expect(body).toContain('data-testid="your-private-events-incomplete"');
	});

	it('says nothing of the kind when none are missing', () => {
		expect(markup({})).not.toContain('your-private-events-incomplete');
	});

	it('loads a private event’s picture from atmo’s own route, and a public one’s as before', () => {
		const blob = (cid: string) => ({
			$type: 'blob' as const,
			ref: { $link: cid },
			mimeType: 'image/png',
			size: 10
		});
		const media = (cid: string) => [{ role: 'thumbnail', content: blob(cid) }];
		const dinner = { ...DINNER, media: media('bafkreidinner') };
		const picnic = { ...PICNIC, media: media('bafkreipicnic') };
		const body = markup(
			{ [DINNER.uri]: { href: '/p/host.example.com/private/3ldinner' } },
			{ mine: [dinner, picnic] }
		);
		const sources = [...body.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
		expect(sources).toContain('/p/did%3Aplc%3Ahost/private/3ldinner/picture/bafkreidinner');
		expect(sources.filter((src) => src.includes('bafkreidinner'))).toHaveLength(1);
		expect(sources.find((src) => src.includes('bafkreipicnic'))).toMatch(/^https:\/\/cdn\./);
	});
});
