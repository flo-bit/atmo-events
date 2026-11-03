import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { AtTags } from '@atmo-dev/kit';
import { recordAtTags } from '@atmo-dev/kit/at-tags';
import { profileAtTags } from './at-tags.js';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const uri = `at://${did}/community.lexicon.calendar.event/meetup`;
const parent = `at://${did}/community.lexicon.calendar.event/conference`;

describe('AT Tags', () => {
	it('maps the resolved event record to its canonical URI and author identity', () => {
		expect(recordAtTags({ uri })).toEqual({
			canonical: [uri],
			author: [`at://${did}`],
			alternate: []
		});
	});

	it('lists auxiliary records once without repeating the canonical record', () => {
		expect(recordAtTags({ uri }, [{ uri: parent }, { uri: parent }, { uri }])).toEqual({
			canonical: [uri],
			author: [`at://${did}`],
			alternate: [parent]
		});
	});

	it('uses the actual profile URI and identifies the account the section belongs to', () => {
		const profileUri = `at://${did}/app.bsky.actor.profile/self`;
		expect(profileAtTags({ did, uri: profileUri })).toEqual({
			alternate: [profileUri],
			me: [`at://${did}`]
		});
	});

	it('does not invent a profile record for an identity-only profile', () => {
		expect(profileAtTags({ did })).toEqual({ alternate: [], me: [`at://${did}`] });
	});

	it('renders meta tags in the server head, with array semantics for every property', () => {
		const { head, body } = render(AtTags, {
			props: {
				tags: {
					canonical: [uri, parent],
					alternate: [parent, parent],
					author: [`at://${did}`, 'at://did:web:other.test'],
					me: [`at://${did}`]
				}
			}
		});
		expect(head).toContain(`<meta name="at:canonical" content="${uri}"`);
		expect(head).toContain(`<meta name="at:canonical" content="${parent}"`);
		expect(head.match(/name="at:alternate"/g)).toHaveLength(1);
		expect(head.match(/name="at:author"/g)).toHaveLength(2);
		expect(head).toContain(`<meta name="at:me" content="at://${did}"`);
		expect(head).not.toContain('<link');
		expect(body).not.toContain('<meta');
	});

	it('renders no tags without page-specific metadata', () => {
		expect(render(AtTags).head).not.toContain('<meta');
		expect(render(AtTags, { props: { tags: {} } }).head).not.toContain('<meta');
	});

	it('escapes metadata attribute values', () => {
		const { head } = render(AtTags, {
			props: { tags: { alternate: ['at://example.test/collection/key" onload="bad'] } }
		});
		expect(head).toContain('key&quot; onload=&quot;bad');
		expect(head).not.toContain('onload="bad');
	});
});
