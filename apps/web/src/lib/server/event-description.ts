import { parseRichText, richTextToPlainText, type RichTextDocument } from '@atmo-dev/kit/richtext';

type Described = { description?: string; facets?: unknown };

/**
 * Event descriptions are Markdown with AT Protocol facets. Parse them on the server and pass
 * the document to EventView, which keeps the Markdown parser out of the client bundle.
 */
export function parseEventDescription(event: Described): RichTextDocument | null {
	return event.description?.trim()
		? parseRichText(event.description, { facets: event.facets, markdown: true, detectLinks: true })
		: null;
}

/** The description without Markdown syntax, for meta tags, calendars and previews. */
export function eventDescriptionText(event: Described): string {
	const document = parseEventDescription(event);
	return document ? richTextToPlainText(document) : '';
}

/** Plain-text descriptions keyed by event URI, e.g. for conference schedules. */
export function eventDescriptionTexts(
	events: Array<Described & { uri: string }>
): Record<string, string> {
	return Object.fromEntries(
		events.flatMap((event) => {
			const text = eventDescriptionText(event);
			return text ? [[event.uri, text]] : [];
		})
	);
}
