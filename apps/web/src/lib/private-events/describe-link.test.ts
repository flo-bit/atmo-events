import { describe, expect, it } from 'vitest';
import { describeLinkBy, privateNoteId } from './describe-link';

/** Just enough of a card for the attachment: its links, each keeping its attributes. */
function card(count: number) {
	const links = Array.from({ length: count }, () => {
		const attributes = new Map<string, string>();
		return {
			attributes,
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			removeAttribute: (name: string) => attributes.delete(name)
		};
	});
	return { links, element: { querySelector: () => links[0] ?? null } as unknown as HTMLElement };
}

describe('describeLinkBy', () => {
	it('points the card’s link at the line that describes it, and lets go after', () => {
		const { links, element } = card(2);
		const undo = describeLinkBy('private-note-1')(element);
		expect(links[0].attributes.get('aria-describedby')).toBe('private-note-1');
		expect(links[1].attributes.has('aria-describedby')).toBe(false);
		if (typeof undo === 'function') undo();
		expect(links[0].attributes.has('aria-describedby')).toBe(false);
	});

	it('does nothing to a card with no link', () => {
		expect(() => describeLinkBy('x')(card(0).element)).not.toThrow();
	});
});

describe('privateNoteId', () => {
	it('is a valid id, the same for the same event and different for another', () => {
		const a = privateNoteId('at://did:plc:host/community.lexicon.calendar.event/3la');
		expect(a).toMatch(/^[A-Za-z][\w-]*$/);
		expect(privateNoteId('at://did:plc:host/community.lexicon.calendar.event/3la')).toBe(a);
		expect(privateNoteId('at://did:plc:host/community.lexicon.calendar.event/3lb')).not.toBe(a);
	});
});
