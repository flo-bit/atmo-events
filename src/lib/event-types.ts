import type { CommunityLexiconCalendarEvent } from '../lexicon-types';

/**
 * Extended event type that includes fields present on actual records
 * but not yet in the lexicon definition (media, facets).
 */
export type EventData = CommunityLexiconCalendarEvent.Main & {
	/** startsAt is always present on actual records even though the lexicon marks it optional */
	startsAt: string;
	media?: Array<{
		role: string;
		alt?: string;
		content: {
			$type: 'blob';
			ref: { $link: string };
		};
		[key: string]: unknown;
	}>;
	facets?: Array<{
		index: { byteStart: number; byteEnd: number };
		features: Array<{ $type: string; did?: string; uri?: string; tag?: string }>;
	}>;
	additionalData?: Record<string, unknown>;
};
