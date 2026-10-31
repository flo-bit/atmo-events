import { describe, expect, it } from 'vitest';
import { getProfileBlobUrl } from '../contrail';

const did = 'did:plc:alice';
const blob = { ref: { $link: 'avatar-cid' }, mimeType: 'image/jpeg' };

describe('profile image CDN URLs', () => {
	it('uses the supported JPEG variant for avatars', () => {
		expect(getProfileBlobUrl(did, blob, 'avatar')).toBe(
			`https://cdn.bsky.app/img/avatar/plain/${did}/avatar-cid@jpeg`
		);
	});

	it('uses smaller WebP covers without changing the avatar format', () => {
		expect(getProfileBlobUrl(did, blob, 'banner')).toBe(
			`https://cdn.bsky.app/img/banner/plain/${did}/avatar-cid@webp`
		);
	});

	it('preserves WebP thumbnails used elsewhere in the app', () => {
		expect(getProfileBlobUrl(did, blob)).toBe(
			`https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/avatar-cid@webp`
		);
	});

	it('does not invent a URL when a profile has no image', () => {
		expect(getProfileBlobUrl(did, undefined, 'avatar')).toBeUndefined();
	});
});
