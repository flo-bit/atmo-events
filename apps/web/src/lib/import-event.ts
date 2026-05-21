/**
 * Shape returned by /api/import-event. Mirrors a subset of EventEditor inputs
 * so the page can prefill its state without round-tripping through the
 * lexicon-shaped EventData (which would flip the editor into "edit" mode).
 */
export type EventImportPrefill = {
	source: string;
	name?: string;
	description?: string;
	/** ISO 8601 with offset */
	startsAt?: string;
	/** ISO 8601 with offset */
	endsAt?: string;
	timezone?: string;
	mode?: 'inperson' | 'virtual' | 'hybrid';
	location?: {
		street?: string;
		locality?: string;
		region?: string;
		country?: string;
	};
	links?: Array<{ uri: string; name: string }>;
	imageUrl?: string;
	/** Base64 data URL of the cover image fetched server-side (no CORS hassles). */
	imageDataUrl?: string;
	/** Controls whether atmo should accept its own RSVPs or punt to the source. */
	rsvpMode?: 'external_only' | 'atmo_too';
};
