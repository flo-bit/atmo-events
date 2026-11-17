// A private event's pictures: images uploaded through atmo and cited by the event's own `media`.
// Kept in the event's space, so only atmo can show them, to the people who can see the event; never
// a public CDN. Values only, so the server and the pages can both import them.
import type { EventMediaUrl } from '@atmo-dev/kit/events-data';

/** Image types a browser shows as an image and never runs; SVG, which can carry a script, is not
 *  one. A picture's response says its type from this list, never what a PDS sent. */
export const PICTURE_TYPES: readonly string[] = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif'
];

/** The editor shrinks an image below 1 MB before it uploads it, so anything near this is not one of
 *  atmo's, and a picture's response stops reading here. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** A blob's CID as a PDS gives it: CIDv1, base32. It goes into a path and a query, so nothing else
 *  is taken. */
const CID = /^b[a-z2-7]{20,100}$/;

export function isPictureCid(value: unknown): value is string {
	return typeof value === 'string' && CID.test(value);
}

interface PictureBlob {
	$type: 'blob';
	ref: { $link: string };
	mimeType: string;
	size: number;
}

interface Picture {
	role: string;
	content: PictureBlob;
	[key: string]: unknown;
}

function isPictureBlob(value: unknown): value is PictureBlob {
	const blob = value as Partial<PictureBlob> | null;
	return (
		!!blob &&
		typeof blob === 'object' &&
		blob.$type === 'blob' &&
		isPictureCid(blob.ref?.$link) &&
		typeof blob.mimeType === 'string' &&
		PICTURE_TYPES.includes(blob.mimeType) &&
		Number.isInteger(blob.size) &&
		blob.size! > 0 &&
		blob.size! <= MAX_PICTURE_BYTES
	);
}

/** One item of an event's `media` that atmo can show: an image blob it would serve. */
export function isPicture(item: unknown): item is Picture {
	const picture = item as { role?: unknown; content?: unknown } | null;
	return (
		!!picture &&
		typeof picture === 'object' &&
		typeof picture.role === 'string' &&
		isPictureBlob(picture.content)
	);
}

/** The picture `media` cites under this CID, if it does. */
export function citedPicture(media: unknown, cid: string): Picture | null {
	if (!Array.isArray(media)) return null;
	return media.find((item) => isPicture(item) && item.content.ref.$link === cid) ?? null;
}

/** Where a page loads one of a private event's pictures: atmo's own route, which serves it only to
 *  someone who can see the event. The kit's components load it from a public CDN without this. */
export function pictureUrl(rkey: string): EventMediaUrl {
	return ({ did, blob }) =>
		`/p/${encodeURIComponent(did)}/private/${encodeURIComponent(rkey)}/picture/${encodeURIComponent(blob.ref.$link)}`;
}
