/**
 * Structural shape of a `community.lexicon.calendar.event` record, plus the
 * extensions atmo adds (timezone, media, facets, theme, bskyPostRef).
 *
 * Defined permissively so consumers using project-local generated lexicon
 * types can still pass their records into our components without type
 * gymnastics. Components inspect specific fields and `$type` strings as
 * needed; rich variant unions live in the consumer's lexicon types if they
 * want them.
 */

export type EventLocationVariant = {
	$type: string;
	[key: string]: unknown;
};

export type EventStatus = string;
export type EventMode = string;

export interface EventLexiconMain {
	$type?: 'community.lexicon.calendar.event';
	createdAt: string;
	name: string;
	description?: string;
	startsAt?: string;
	endsAt?: string;
	locations?: EventLocationVariant[];
	mode?: EventMode;
	status?: EventStatus;
}

export type EventData = EventLexiconMain & {
	startsAt: string;
	timezone?: string;
	/** Atmo stores URIs as objects with optional names rather than bare strings. */
	uris?: Array<{ uri: string; name?: string }>;
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
	bskyPostRef?: {
		uri: string;
		cid: string;
		showComments: boolean;
	};
};
