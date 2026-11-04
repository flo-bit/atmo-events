import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { getCDNImageBlobUrl } from '@atmo-dev/events-ui';
import Layout from './+layout.svelte';

vi.mock('$app/state', () => ({ page: { status: 200, error: null, data: {} } }));
vi.mock('$app/env/public', async () =>
	(await import('../test/public-env')).publicEnv({ PUBLIC_CDN_URL: 'https://cdn.test/' })
);

const blob = { $type: 'blob' as const, ref: { $link: 'image-cid' } };

describe('root layout', () => {
	it('points the shared components at the image CDN a setting names', () => {
		const image = () => getCDNImageBlobUrl({ did: 'did:plc:alice', blob });
		expect(image()).not.toMatch(/^https:\/\/cdn\.test\//);

		// render() is lazy: the layout runs when its body is read.
		const { body } = render(Layout, {
			props: { children: createRawSnippet(() => ({ render: () => '<main></main>' })) }
		});
		expect(body).toContain('<main></main>');

		expect(image()).toMatch(/^https:\/\/cdn\.test\/img\//);
	});
});
