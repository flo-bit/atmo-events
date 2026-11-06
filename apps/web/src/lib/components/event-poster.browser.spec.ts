import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { EventCard } from '@atmo-dev/kit/events';

const url = 'https://laugh.town/cdn/p/posters/47fee09eaa4c3fab.webp';
it.each(['poster', 'uri'])(
	'displays laugh.town %s images using the installed Kit package',
	async (source) => {
		await render(EventCard, {
			event: {
				name: 'Comedy Writing Workshop Series (18+)',
				createdAt: '2026-06-10T06:49:33.074Z',
				startsAt: '2026-11-05T17:30:00-06:00',
				did: 'did:plc:k6owgpe2rkkchoiivxhzp2t4',
				rkey: '3mpeyybund2ib',
				uri: 'at://did:plc:k6owgpe2rkkchoiivxhzp2t4/community.lexicon.calendar.event/3mpeyybund2ib',
				...(source === 'poster'
					? { poster: { url, width: 600, height: 600 } }
					: { uris: [{ uri: url, name: 'Event Image' }] })
			}
		});
		await expect
			.element(page.getByRole('img', { name: 'Comedy Writing Workshop Series (18+)', exact: true }))
			.toHaveAttribute('src', url);
	}
);
