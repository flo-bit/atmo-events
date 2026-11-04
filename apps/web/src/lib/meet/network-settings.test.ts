import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicEnv } from '../../test/public-env';
import { CONNECTION_COLLECTION } from './connection';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';

afterEach(() => {
	vi.doUnmock('$app/env/public');
	vi.resetModules();
});

/** Imports a module as a deployment with these network settings sees it. */
async function withSettings<T>(settings: Record<string, unknown>, load: () => Promise<T>) {
	vi.resetModules();
	vi.doMock('$app/env/public', () => publicEnv(settings));
	return load();
}

/** The address the Meet tool's Jetstream socket opens. */
async function socketUrl(settings: Record<string, unknown>) {
	const { watchConnections } = await withSettings(settings, () => import('./jetstream'));
	const createSocket = vi.fn<(url: string) => WebSocket>(
		() => ({ close: vi.fn() }) as unknown as WebSocket
	);
	watchConnections({ createSocket, onChange: vi.fn() })();
	const url = new URL(createSocket.mock.calls[0]![0]);
	return `${url.origin}${url.pathname}`;
}

function failingFetch() {
	return vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
}

describe('the Meet tool on another atproto network', () => {
	it('watches the public Jetstream when none is set', async () => {
		expect(await socketUrl({})).toBe('wss://jetstream2.us-east.bsky.network/subscribe');
	});

	it('watches the Jetstream a setting names, over WebSocket', async () => {
		expect(await socketUrl({ PUBLIC_JETSTREAM_URL: 'https://jetstream.test' })).toBe(
			'wss://jetstream.test/subscribe'
		);
		expect(await socketUrl({ PUBLIC_JETSTREAM_URL: 'http://127.0.0.1:6008' })).toBe(
			'ws://127.0.0.1:6008/subscribe'
		);
		expect(await socketUrl({ PUBLIC_JETSTREAM_URL: 'wss://jetstream.test/' })).toBe(
			'wss://jetstream.test/subscribe'
		);
	});

	it('reads an incoming meeting from the Slingshot a setting names', async () => {
		const { incomingMeetingDate } = await withSettings(
			{ PUBLIC_SLINGSHOT_URL: 'https://slingshot.test/base' },
			() => import('#lib/server/meet.js')
		);
		const fetcher = failingFetch();
		await expect(
			incomingMeetingDate(`at://${bob}/${CONNECTION_COLLECTION}/3mold`, bob, alice, fetcher)
		).rejects.toThrow();
		expect(String(fetcher.mock.calls[0]![0])).toMatch(
			/^https:\/\/slingshot\.test\/base\/xrpc\/com\.atproto\.repo\.getRecord\?/
		);
	});

	it('lists incoming meetings from the Constellation a setting names', async () => {
		const { listIncomingConnections } = await withSettings(
			{ PUBLIC_CONSTELLATION_URL: 'https://constellation.test' },
			() => import('#lib/server/meet.js')
		);
		const fetcher = failingFetch();
		await expect(listIncomingConnections(alice, fetcher)).rejects.toThrow();
		expect(new URL(String(fetcher.mock.calls[0]![0])).origin).toBe('https://constellation.test');
	});
	// Profiles: profile.test.ts, which sets the address once instead of reloading the kit.
});
