import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AtTags } from '@atmo-dev/kit';

function values(property: string) {
	return [...document.head.querySelectorAll<HTMLMetaElement>(`meta[name="at:${property}"]`)].map(
		(meta) => meta.content
	);
}

describe('AT metadata navigation', () => {
	it('replaces records and clears tags when leaving a record page', async () => {
		const first = 'at://did:plc:host/community.lexicon.calendar.event/first';
		const second = 'at://did:plc:other/community.lexicon.calendar.event/second';
		const view = await render(AtTags, {
			tags: { canonical: [first], author: ['at://did:plc:host'], alternate: [second] }
		});
		expect(values('canonical')).toEqual([first]);
		expect(values('alternate')).toEqual([second]);

		await view.rerender({ tags: { canonical: [second], author: ['at://did:plc:other'] } });
		expect(values('canonical')).toEqual([second]);
		expect(values('author')).toEqual(['at://did:plc:other']);
		expect(values('alternate')).toEqual([]);

		await view.rerender({ tags: undefined });
		expect(document.head.querySelectorAll('meta[name^="at:"]')).toHaveLength(0);
	});
});
