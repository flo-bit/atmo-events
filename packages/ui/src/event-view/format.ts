import { marked } from 'marked';
import { sanitize } from '../cal/sanitize.js';
import { getProfileUrl } from '../profile-url.js';

export function formatMonth(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

export function formatDay(date: Date): number {
	return date.getDate();
}

export function formatWeekday(date: Date): string {
	return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function formatFullDate(date: Date): string {
	const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
	if (date.getFullYear() !== new Date().getFullYear()) {
		options.year = 'numeric';
	}
	return date.toLocaleDateString('en-US', options);
}

export function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function getModeLabel(mode: string): string {
	if (mode.includes('virtual')) return 'Virtual';
	if (mode.includes('hybrid')) return 'Hybrid';
	if (mode.includes('inperson')) return 'In-Person';
	return 'Event';
}

/** Optional local accent class for an event mode. */
export function getModeColor(mode: string): string {
	if (mode.includes('virtual')) return 'cyan';
	if (mode.includes('hybrid')) return 'purple';
	if (mode.includes('inperson')) return 'amber';
	return '';
}

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) =>
	`<a target="_blank" rel="noopener noreferrer nofollow" href="${href}" class="text-accent-600 dark:text-accent-400 hover:underline">${text}</a>`;

type Facet = {
	index: { byteStart: number; byteEnd: number };
	features: { $type: string; did?: string; uri?: string; tag?: string }[];
};

function renderDescription(text: string, facets?: Facet[]): string {
	let result = text;

	if (facets && facets.length > 0) {
		const encoded = new TextEncoder().encode(text);
		const decoder = new TextDecoder();

		const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

		const parts: string[] = [];
		let cursor = 0;

		for (const facet of sorted) {
			const feature = facet.features?.[0];
			if (!feature) continue;
			if (facet.index.byteStart < cursor) continue;

			const segmentText = decoder.decode(encoded.slice(facet.index.byteStart, facet.index.byteEnd));

			let mdLink: string | null = null;
			switch (feature.$type) {
				case 'app.bsky.richtext.facet#mention': {
					const handle = segmentText.startsWith('@') ? segmentText.slice(1) : segmentText;
					mdLink = `[${segmentText}](${getProfileUrl(handle || feature.did || '')})`;
					break;
				}
				case 'app.bsky.richtext.facet#link':
					mdLink = `[${segmentText}](${feature.uri})`;
					break;
				case 'app.bsky.richtext.facet#tag':
					mdLink = `[${segmentText}](https://bsky.app/hashtag/${feature.tag})`;
					break;
			}

			if (mdLink) {
				parts.push(decoder.decode(encoded.slice(cursor, facet.index.byteStart)));
				parts.push(mdLink);
				cursor = facet.index.byteEnd;
			}
		}

		parts.push(decoder.decode(encoded.slice(cursor)));
		result = parts.join('');
	}

	return marked.parse(result, { renderer }) as string;
}

export function buildDescriptionHtml(
	description: string | undefined,
	facets: unknown
): string | null {
	if (!description) return null;
	return sanitize(renderDescription(description, facets as Facet[] | undefined), {
		ADD_ATTR: ['target']
	});
}
