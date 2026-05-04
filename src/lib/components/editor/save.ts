import { resolveHandle } from '$lib/atproto/methods';
import { compressImage } from '$lib/atproto/image-helper';
import { tokenize, type Token } from '@atcute/bluesky-richtext-parser';
import type { Handle } from '@atcute/lexicons';
import { datetimeLocalToISO } from '$lib/date-format';
import { designs, resolveAccentColor } from '$lib/components/thumbnails/designs';
import type { FlatEventRecord } from '$lib/contrail';
import type { EventTheme } from '$lib/theme';
import type { EventLocation, EventMode, Visibility } from './types';

export async function tokensToFacets(tokens: Token[]): Promise<Record<string, unknown>[]> {
	const encoder = new TextEncoder();
	const facets: Record<string, unknown>[] = [];
	let byteOffset = 0;

	for (const token of tokens) {
		const tokenBytes = encoder.encode(token.raw);
		const byteStart = byteOffset;
		const byteEnd = byteOffset + tokenBytes.length;

		if (token.type === 'mention') {
			try {
				const did = await resolveHandle({ handle: token.handle as Handle });
				if (did) {
					facets.push({
						index: { byteStart, byteEnd },
						features: [{ $type: 'app.bsky.richtext.facet#mention', did }]
					});
				}
			} catch {
				// skip unresolvable mentions
			}
		} else if (token.type === 'autolink') {
			facets.push({
				index: { byteStart, byteEnd },
				features: [{ $type: 'app.bsky.richtext.facet#link', uri: token.url }]
			});
		} else if (token.type === 'topic') {
			facets.push({
				index: { byteStart, byteEnd },
				features: [{ $type: 'app.bsky.richtext.facet#tag', tag: token.name }]
			});
		}

		byteOffset = byteEnd;
	}

	return facets;
}

/** Render a selected thumbnail preset to a PNG File so it can be uploaded
 *  as a blob like a user-provided image. Returns null if the preset design
 *  is missing or the canvas fails to produce a blob. */
export async function renderPresetThumbnail(args: {
	design: string;
	seed: number;
	name: string;
	dateStr: string;
	accent?: string;
}): Promise<File | null> {
	const drawer = designs[args.design];
	if (!drawer) return null;
	const canvas = document.createElement('canvas');
	canvas.width = 800;
	canvas.height = 800;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	drawer(
		ctx,
		800,
		800,
		args.name.trim() || 'Event',
		args.dateStr,
		args.seed,
		resolveAccentColor(args.accent)
	);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) return null;
	return new File([blob], 'thumbnail.png', { type: 'image/png' });
}

export async function buildThumbnailMedia(args: {
	isNew: boolean;
	thumbnailChanged: boolean;
	thumbnailFile: File | null;
	existingMedia: Array<Record<string, unknown>>;
	uploadBlob: (blob: Blob) => Promise<Record<string, unknown>>;
}): Promise<Array<Record<string, unknown>> | undefined> {
	const { isNew, thumbnailChanged, thumbnailFile, existingMedia, uploadBlob } = args;

	if (!isNew && !thumbnailChanged) {
		return existingMedia.length > 0 ? existingMedia : undefined;
	}

	if (!thumbnailFile) {
		const remaining = existingMedia.filter((m) => m.role !== 'thumbnail');
		return remaining.length > 0 ? remaining : undefined;
	}

	const compressed = await compressImage(thumbnailFile);
	const blobRef = await uploadBlob(compressed.blob);
	if (!blobRef) return existingMedia.length > 0 ? existingMedia : undefined;

	return [
		...existingMedia.filter((m) => m.role !== 'thumbnail'),
		{
			role: 'thumbnail',
			content: blobRef,
			aspect_ratio: {
				width: compressed.aspectRatio.width,
				height: compressed.aspectRatio.height
			}
		}
	];
}

export async function buildEventRecord(args: {
	eventData: FlatEventRecord | null;
	isNew: boolean;
	name: string;
	description: string;
	startsAt: string;
	endsAt: string;
	timezone: string;
	mode: EventMode;
	visibility: Visibility;
	theme: EventTheme;
	links: Array<{ uri: string; name: string }>;
	location: EventLocation | null;
	locationChanged: boolean;
	media: Array<Record<string, unknown>> | undefined;
}): Promise<Record<string, unknown>> {
	const {
		eventData,
		isNew,
		name,
		description,
		startsAt,
		endsAt,
		timezone,
		mode,
		visibility,
		theme,
		links,
		location,
		locationChanged,
		media
	} = args;

	const createdAt = isNew
		? new Date().toISOString()
		: eventData?.createdAt || new Date().toISOString();

	// Spread original record to preserve unspecced fields (e.g. additionalData)
	const record: Record<string, unknown> = {
		...(eventData ? { ...eventData } : {}),
		$type: 'community.lexicon.calendar.event',
		createdWith: 'https://atmo.rsvp',
		name: name.trim(),
		mode: `community.lexicon.calendar.event#${mode}`,
		status: 'community.lexicon.calendar.event#scheduled',
		startsAt: datetimeLocalToISO(startsAt, timezone),
		timezone,
		createdAt,
		theme
	};
	// Remove flattened fields that aren't part of the actual record
	for (const k of [
		'cid',
		'did',
		'rkey',
		'uri',
		'rsvps',
		'rsvpsCount',
		'rsvpsGoingCount',
		'rsvpsInterestedCount',
		'rsvpsNotgoingCount'
	]) {
		delete record[k];
	}

	const trimmedDescription = description.trim();
	if (trimmedDescription) {
		record.description = trimmedDescription;
		const tokens = tokenize(trimmedDescription);
		const facets = await tokensToFacets(tokens);
		if (facets.length > 0) record.facets = facets;
	}

	if (endsAt) record.endsAt = datetimeLocalToISO(endsAt, timezone);
	if (media) record.media = media;
	if (links.length > 0) record.uris = links;

	if (isNew || locationChanged) {
		if (location) {
			record.locations = [
				{
					$type: 'community.lexicon.location.address',
					...location
				}
			];
		}
		// If changed/new but no location, locations stays undefined (removed/absent)
	} else if (eventData?.locations && eventData.locations.length > 0) {
		record.locations = eventData.locations;
	}

	const existingPrefs = ((record.preferences as Record<string, unknown> | undefined) ??
		{}) as Record<string, unknown>;
	record.preferences = {
		...existingPrefs,
		showInDiscovery: visibility !== 'unlisted'
	};

	return record;
}
