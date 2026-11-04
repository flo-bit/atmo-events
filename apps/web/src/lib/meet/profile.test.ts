import { afterEach, describe, expect, it, vi } from 'vitest';
import { meetingProfile } from './profile';

vi.mock('$app/env/public', async () =>
	(await import('../../test/public-env')).publicEnv({ PUBLIC_APPVIEW_URL: 'https://appview.test' })
);

afterEach(() => vi.unstubAllGlobals());

describe('Meet profiles', () => {
	it('come from the Bluesky API a setting names', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
		vi.stubGlobal('fetch', fetcher);
		expect(await meetingProfile('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')).toBeUndefined();
		expect(new URL(String(fetcher.mock.calls[0]![0])).origin).toBe('https://appview.test');
	});
});
