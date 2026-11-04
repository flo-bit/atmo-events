import { describe, expect, it, vi } from 'vitest';
import { getProfileBlobUrl } from '#lib/contrail.js';

vi.mock('$app/env/public', async () =>
	(await import('../../test/public-env')).publicEnv({ PUBLIC_CDN_URL: 'https://cdn.test' })
);

describe('profile image links', () => {
	it('use the image CDN a setting names', () => {
		const blob = { ref: { $link: 'image-cid' } };
		for (const preset of ['feed_thumbnail', 'avatar', 'banner'] as const) {
			expect(getProfileBlobUrl('did:plc:alice', blob, preset)).toMatch(
				/^https:\/\/cdn\.test\/img\//
			);
		}
	});
});
