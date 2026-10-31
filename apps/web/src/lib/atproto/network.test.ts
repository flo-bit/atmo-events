import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtprotoNetwork, requiredEndpoint } from '@svelte-atproto/oauth/network';
import { variables } from '../../env';
import { publicEnv } from '../../test/public-env';

afterEach(() => {
	vi.doUnmock('$app/env/public');
	vi.resetModules();
});

/** The network module, as a deployment with these settings sees it. */
async function withSettings(settings: Record<string, unknown>) {
	vi.resetModules();
	vi.doMock('$app/env/public', () => publicEnv(settings));
	return import('./network');
}

function validate(name: keyof typeof variables, value: string | undefined) {
	return variables[name].schema['~standard'].validate(value);
}

describe('network settings', () => {
	it('are optional: unset or blank leaves the default', () => {
		for (const name of Object.keys(variables) as (keyof typeof variables)[]) {
			expect(validate(name, undefined)).toEqual({ value: undefined });
			expect(validate(name, '  ')).toEqual({ value: undefined });
		}
	});

	it('take a URL of the service’s scheme', () => {
		expect(validate('PUBLIC_PLC_URL', ' https://plc.test ')).toEqual({ value: 'https://plc.test' });
		expect(validate('PUBLIC_JETSTREAM_URL', 'wss://jetstream.test')).toEqual({
			value: 'wss://jetstream.test'
		});
		expect(validate('PUBLIC_PLC_URL', 'plc.test')).toHaveProperty('issues');
		expect(validate('PUBLIC_PLC_URL', 'wss://plc.test')).toHaveProperty('issues');
		expect(validate('PUBLIC_JETSTREAM_URL', 'https://jetstream.test')).toHaveProperty('issues');
	});

	it('take relays as a comma-separated list', () => {
		expect(validate('PUBLIC_RELAY_URLS', 'https://a.test, https://b.test,')).toEqual({
			value: ['https://a.test', 'https://b.test']
		});
		expect(validate('PUBLIC_RELAY_URLS', 'https://a.test,b.test')).toHaveProperty('issues');
	});
});

/** A service's address on the OAuth library's own public network, for comparison. */
function publicAddress(name: Parameters<typeof requiredEndpoint>[1]) {
	return requiredEndpoint({ network: createAtprotoNetwork({}) }, name);
}

describe('atprotoNetwork', () => {
	it('is the public network when nothing is set', async () => {
		const { serviceUrl } = await withSettings({});
		for (const name of [
			'plc',
			'doh',
			'slingshot',
			'ufo',
			'constellation',
			'appview',
			'cdn'
		] as const) {
			expect(serviceUrl(name)).toBe(publicAddress(name));
		}
	});

	it('uses each address a setting names', async () => {
		const { serviceUrl } = await withSettings({
			PUBLIC_PLC_URL: 'https://plc.test/',
			PUBLIC_DOH_URL: 'https://dns.test/dns-query',
			PUBLIC_SLINGSHOT_URL: 'https://slingshot.test',
			PUBLIC_CONSTELLATION_URL: 'https://constellation.test',
			PUBLIC_APPVIEW_URL: 'https://appview.test',
			PUBLIC_CDN_URL: 'https://cdn.test'
		});
		expect(serviceUrl('plc')).toBe('https://plc.test');
		expect(serviceUrl('doh')).toBe('https://dns.test/dns-query');
		expect(serviceUrl('slingshot')).toBe('https://slingshot.test');
		expect(serviceUrl('constellation')).toBe('https://constellation.test');
		expect(serviceUrl('appview')).toBe('https://appview.test');
		expect(serviceUrl('cdn')).toBe('https://cdn.test');
		// Not set, so still the public network's.
		expect(serviceUrl('ufo')).toBe(publicAddress('ufo'));
	});
});

describe('contrailNetwork', () => {
	it('leaves contrail on its defaults when nothing is set', async () => {
		const { contrailNetwork } = await withSettings({});
		expect(contrailNetwork()).toEqual({ networkOverrides: {} });
	});

	it('gives contrail the same addresses', async () => {
		const { contrailNetwork } = await withSettings({
			PUBLIC_PLC_URL: 'https://plc.test',
			PUBLIC_SLINGSHOT_URL: 'https://slingshot.test/',
			PUBLIC_CONSTELLATION_URL: 'https://constellation.test',
			PUBLIC_JETSTREAM_URL: 'wss://jetstream.test',
			PUBLIC_RELAY_URLS: ['https://relay.test']
		});
		const network = contrailNetwork();
		expect(network).toMatchObject({
			jetstreams: ['wss://jetstream.test'],
			relays: ['https://relay.test'],
			constellation: { url: 'https://constellation.test' },
			networkOverrides: {
				// The method's URL, since contrail only appends ?identifier=.
				slingshotUrl: 'https://slingshot.test/xrpc/com.bad-example.identity.resolveMiniDoc'
			}
		});
	});

	it('resolves did:plc documents at the PLC directory a setting names', async () => {
		const fetch = vi.fn(async () => new Response('{}', { status: 404 }));
		vi.stubGlobal('fetch', fetch);
		try {
			const { contrailNetwork } = await withSettings({ PUBLIC_PLC_URL: 'https://plc.test' });
			await contrailNetwork()
				.networkOverrides?.resolver?.resolve('did:plc:abcdefghijklmnopqrstuvwx')
				.catch(() => {});
			expect(new URL(String((fetch.mock.calls[0] as unknown[])[0])).origin).toBe(
				'https://plc.test'
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('the in-browser tests’ stand-in for $app/env/public', () => {
	it('has every setting, each unset', async () => {
		const standIn = await import('./test-env-public');
		expect(Object.keys(standIn).sort()).toEqual(Object.keys(variables).sort());
		expect(Object.values(standIn).filter((value) => value !== undefined)).toEqual([]);
	});
});
