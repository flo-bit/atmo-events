import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { chromium } from 'playwright';
import type { Facet } from '@atmo-dev/kit';
import type { PreferredSocialClient } from '@atmo-dev/kit/social';
import { parseEventDescription } from '#lib/server/event-description.js';

const { user } = vi.hoisted(() => ({
	user: {
		isLoggedIn: true,
		did: 'did:plc:viewer',
		canPostToBluesky: false,
		profile: null,
		preferredSocialClient: null as PreferredSocialClient | null
	}
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user }));
vi.mock('#lib/components/editor/adapter.js', () => ({ createInAppAdapter: () => ({}) }));
vi.mock('#lib/moderation/reports.remote', () => ({ submitReport: vi.fn() }));
vi.mock('#lib/starter-packs/packs.remote.js', () => ({ openStarterPack: vi.fn() }));
vi.mock('#lib/contrail/attendees.remote.js', () => ({ loadEventAttendees: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://atmo.rsvp/p/host/e/event') } }));

import EventPage from './+page.svelte';
import AppFooter from '#lib/components/AppFooter.svelte';

function markup(
	cid: string | undefined = 'bafytest',
	packs = { enabled: false, going: 0, interested: 0 },
	showComments = false,
	description?: { description: string; facets?: Facet[] },
	parsed = false
) {
	return (
		render(EventPage, {
			props: {
				data: {
					atTags: {
						canonical: ['at://did:plc:host/community.lexicon.calendar.event/event'],
						author: ['at://did:plc:host']
					},
					canPostToBluesky: false,
					isModerator: false,
					did: null,
					profile: null,
					pageTitle: 'Meetup',
					pageDescription: 'A meetup',
					ogImage: 'https://atmo.rsvp/og.png',
					starterPacksEnabled: packs.enabled,
					eventData: {
						name: 'Meetup',
						startsAt: '2099-10-24T18:00:00Z',
						createdAt: '2026-10-01T12:00:00Z',
						did: 'did:plc:host',
						rkey: 'event',
						uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
						...(showComments
							? {
									bskyPostRef: {
										uri: 'at://did:plc:host/app.bsky.feed.post/root',
										cid: 'post-cid',
										showComments: true
									}
								}
							: {}),
						cid,
						...description
					},
					description: parsed && description ? parseEventDescription(description) : null,
					actorDid: 'did:plc:host',
					reportSubject: cid
						? {
								$type: 'com.atproto.repo.strongRef',
								uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
								cid
							}
						: undefined,
					rkey: 'event',
					hostProfile: null,
					attendees: {
						going: [],
						interested: [],
						goingCount: packs.going,
						interestedCount: packs.interested
					},
					viewerRsvpStatus: null,
					viewerRsvpRkey: null,
					parentEvent: null,
					parentEventActor: null,
					parentScheduleUrl: null,
					vod: null,
					isConference: false,
					conferenceTalks: [],
					conferenceTalkDescriptions: {},
					conferenceTimezone: 'UTC',
					conferenceRsvpStatuses: {},
					conferenceRsvpRkeys: {},
					conferenceVods: {},
					loggedIn: user.isLoggedIn,
					speakerProfiles: []
				}
			}
		}).body +
		render(AppFooter, {
			props: {
				subject: cid
					? {
							$type: 'com.atproto.repo.strongRef',
							uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
							cid
						}
					: undefined
			}
		}).body
	);
}

afterEach(() => {
	user.isLoggedIn = true;
	user.did = 'did:plc:viewer';
	user.preferredSocialClient = null;
});

describe('event description security', () => {
	const payload = '<script>window.__atmoSecurityProbe = 1</script x>';

	it.each([true, false])(
		'escapes descriptions in the actual event page; signed in: %s',
		(signedIn) => {
			user.isLoggedIn = signedIn;
			const html = markup('bafytest', undefined, false, { description: payload });
			expect(html).toContain('&lt;script>window.__atmoSecurityProbe = 1&lt;/script x>');
			expect(html).not.toContain(payload);
		}
	);

	it('keeps Markdown literal and only renders validated facet links', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const description = '👋 @alice.test #café **bold** [click](javascript:alert(1))';
		const feature = (label: string, value: Facet['features'][number]): Facet => {
			const offset = description.indexOf(label);
			return {
				index: {
					byteStart: new TextEncoder().encode(description.slice(0, offset)).length,
					byteEnd: new TextEncoder().encode(description.slice(0, offset + label.length)).length
				},
				features: [value]
			};
		};
		const html = markup('bafytest', undefined, false, {
			description,
			facets: [
				feature('@alice.test', {
					$type: 'app.bsky.richtext.facet#mention',
					did: 'did:web:alice.test'
				}),
				feature('#café', { $type: 'app.bsky.richtext.facet#tag', tag: 'café' }),
				feature('click', { $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' })
			]
		});
		expect(html).toContain('href="/p/did%3Aweb%3Aalice.test"');
		expect(html).toContain('href="https://blacksky.community/hashtag/caf%C3%A9"');
		expect(html).toContain('**bold** [');
		expect(html).not.toContain('<strong>bold</strong>');
		expect(html).not.toMatch(/<a\b[^>]*href="javascript:/i);
	});

	it('renders server-parsed Markdown with validated facet links', () => {
		const description =
			'## Plan\n\n**@alice.test** <script>x</script> [click](javascript:alert(1))';
		const offset = new TextEncoder().encode('## Plan\n\n**').length;
		const html = markup(
			'bafytest',
			undefined,
			false,
			{
				description,
				facets: [
					{
						index: { byteStart: offset, byteEnd: offset + '@alice.test'.length },
						features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:web:alice.test' }]
					}
				]
			},
			true
		).replace(/<!--.*?-->/g, '');
		expect(html).toMatch(/<h3[^>]*>Plan<\/h3>/);
		expect(html).toMatch(/<strong[^>]*><a href="\/p\/did%3Aweb%3Aalice.test"/);
		expect(html).toContain('&lt;script>x&lt;/script>');
		expect(html).not.toMatch(/<a\b[^>]*href="javascript:/i);
		expect(html).toContain('click');
	});

	it.each([false, true])(
		'does not execute the payload on initial page load; parsed Markdown: %s',
		async (parsed) => {
			const browser = await chromium.launch({ headless: true });
			try {
				for (const signedIn of [false, true]) {
					user.isLoggedIn = signedIn;
					const html = markup('bafytest', undefined, false, { description: payload }, parsed);
					const page = await browser.newPage();
					await page.addInitScript(() => Object.assign(window, { __atmoSecurityProbe: 0 }));
					await page.route('**/*', (route) =>
						route.request().url() === 'https://event-page.invalid/'
							? route.fulfill({
									contentType: 'text/html',
									body: `<!doctype html><html><body>${html}</body></html>`
								})
							: route.abort()
					);
					await page.goto('https://event-page.invalid/');
					expect(await page.getByText(payload, { exact: true }).count()).toBe(1);
					expect(await page.evaluate(() => Reflect.get(window, '__atmoSecurityProbe'))).toBe(0);
					await page.close();
				}
			} finally {
				await browser.close();
			}
		}
	);
});

describe('event comment client', () => {
	it('forwards the signed-in viewer’s preferred client to the comments', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const html = markup('bafytest', undefined, true);
		expect(html).toContain('Add a comment on Blacksky');
		expect(html).toContain('href="https://blacksky.community/profile/did:plc:host/post/root"');
	});
});

describe('event starter pack visibility', () => {
	it('passes the viewer’s preferred client to the starter pack button', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const html = markup('bafytest', { enabled: true, going: 4, interested: 2 });
		expect(html).toContain('Follow attendees on Blacksky.');
		expect(html).not.toContain('Follow attendees on Bluesky.');
	});
	it.each([
		[true, 3, 2, false],
		[true, 3, 3, true],
		[true, 6, 0, true],
		[true, 0, 6, true],
		[false, 6, 6, false]
	] as const)(
		'enabled=%s, going=%s, interested=%s: visible=%s',
		(enabled, going, interested, visible) => {
			const html = markup('bafytest', { enabled, going, interested });
			expect(html.includes('Starter pack ↗')).toBe(visible);
			expect(html.includes('Follow attendees on Bluesky.')).toBe(visible);
		}
	);
});

describe('event reporting', () => {
	it('offers reporting in the footer after another host’s event', () => {
		const html = markup();
		expect(html).toMatch(/<footer\b[^>]*>[\s\S]*Report event[\s\S]*<\/footer>/);
		expect(html.slice(0, html.indexOf('<footer'))).toContain('Add to Calendar');
	});

	it('does not offer reporting on your own event', () => {
		user.did = 'did:plc:host';
		expect(markup()).not.toContain('Report event');
	});

	it('keeps reporting available while signed out, even with a stale viewer DID', () => {
		user.isLoggedIn = false;
		user.did = 'did:plc:host';
		expect(markup()).toMatch(/<footer\b[^>]*>[\s\S]*Report event[\s\S]*<\/footer>/);
	});

	it('requires a CID for a strong-reference report', () => {
		expect(markup('')).not.toContain('Report event');
	});
});
