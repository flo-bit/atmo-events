import type { CommunityLexiconCalendarEvent } from '../lexicon-types';

/**
 * Extended event type that includes fields present on actual records
 * but not yet in the lexicon definition (media, facets).
 */
export type EventData = CommunityLexiconCalendarEvent.Main & {
	/** startsAt is always present on actual records even though the lexicon marks it optional */
	startsAt: string;
	/**
	 * IANA timezone id (e.g. "Europe/Berlin") in which the event's wall-clock times
	 * were authored. Not part of the upstream lexicon, but persisted on records we
	 * write so display code can render startsAt/endsAt in the author's intended zone.
	 */
	timezone?: string;
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
	theme?: {
		name: string;
		accentColor: string;
		baseColor: string;
	};
};
