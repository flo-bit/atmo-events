// The kit's event card is one link with no way to pass it attributes, so a line drawn beside it, like
// a private event's lock line, is tied to that link here, once the page is in the browser.
import type { Attachment } from 'svelte/attachments';

/** A stable id for the line beside a card, from the event's URI, valid as an HTML id. */
export function privateNoteId(uri: string): string {
	return `private-note-${uri.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Points the first link inside the element at the line with this id, so a screen reader reads that
 *  line with the link. */
export function describeLinkBy(id: string): Attachment<HTMLElement> {
	return (element) => {
		const link = element.querySelector('a');
		link?.setAttribute('aria-describedby', id);
		return () => link?.removeAttribute('aria-describedby');
	};
}
