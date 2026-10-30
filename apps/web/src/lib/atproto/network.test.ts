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
		expect(validate('PUBLIC_JETSTREAM_URL', 'ftp://jetstream.test')).toHaveProperty('issues');
	});

	it('refuse a user, password or #fragment', () => {
		expect(validate('PUBLIC_PLC_URL', 'https://plc.test/#top')).toHaveProperty('issues');
		expect(validate('PUBLIC_PLC_URL', 'https://me:pw@plc.test')).toHaveProperty('issues');
		expect(validate('PUBLIC_DOH_URL', 'https://dns.test/dns-query')).toEqual({
			value: 'https://dns.test/dns-query'
		});
	});

	it('refuse an address not written scheme://host, a backslash, and an empty ? or #', () => {
		for (const value of ['https:cdn.test', 'https:/cdn.test', 'https:\\\\cdn.test']) {
			expect(validate('PUBLIC_CDN_URL', value)).toHaveProperty('issues');
		}
		// The URL parser reads a backslash as a slash, but text built from the address keeps it.
		expect(validate('PUBLIC_APPVIEW_URL', 'https://appview.test\\')).toHaveProperty('issues');
		expect(validate('PUBLIC_CDN_URL', 'https://cdn.test\\img')).toHaveProperty('issues');
		expect(validate('PUBLIC_CDN_URL', 'HTTPS://cdn.test')).toEqual({ value: 'HTTPS://cdn.test' });
		expect(validate('PUBLIC_PLC_URL', 'https://plc.test/#')).toHaveProperty('issues');
		expect(validate('PUBLIC_APPVIEW_URL', 'https://appview.test/?')).toHaveProperty('issues');
		expect(validate('PUBLIC_CDN_URL', 'https://cdn.test/?')).toHaveProperty('issues');
	});

	it('take Jetstream as an origin, over HTTP or WebSocket', () => {
		for (const value of ['https://jetstream.test', 'wss://jetstream.test/']) {
			expect(validate('PUBLIC_JETSTREAM_URL', value)).toEqual({ value });
		}
		expect(validate('PUBLIC_JETSTREAM_URL', 'wss://jetstream.test/subscribe')).toHaveProperty(
			'issues'
		);
		expect(validate('PUBLIC_JETSTREAM_URL', 'wss://jetstream.test?compress=true')).toHaveProperty(
			'issues'
		);
	});

	it('take a service that adds its own path as an origin', () => {
		const services = [
			'PUBLIC_PLC_URL',
			'PUBLIC_CONSTELLATION_URL',
			'PUBLIC_APPVIEW_URL',
			'PUBLIC_SIGNUP_PDS_URL'
		] as const;
		for (const name of services) {
			expect(validate(name, 'https://a.test/')).toEqual({ value: 'https://a.test/' });
			expect(validate(name, 'https://a.test/api')).toHaveProperty('issues');
			expect(validate(name, 'https://a.test?v=1')).toHaveProperty('issues');
		}
		expect(validate('PUBLIC_RELAY_URLS', 'https://a.test,https://b.test/api')).toHaveProperty(
			'issues'
		);
	});

	it('take the image CDN and Slingshot with a path, but no ?query', () => {
		for (const name of ['PUBLIC_CDN_URL', 'PUBLIC_SLINGSHOT_URL'] as const) {
			expect(validate(name, 'https://a.test/base')).toEqual({ value: 'https://a.test/base' });
			expect(validate(name, 'https://a.test?v=1')).toHaveProperty('issues');
		}
	});

	it('take the sign-up PDS over HTTPS only', () => {
		expect(validate('PUBLIC_SIGNUP_PDS_URL', 'https://pds.test')).toEqual({
			value: 'https://pds.test'
		});
		expect(validate('PUBLIC_SIGNUP_PDS_URL', 'http://pds.test')).toHaveProperty('issues');
		// The others take http, for a test network on this machine.
		expect(validate('PUBLIC_PLC_URL', 'http://plc.test')).toEqual({ value: 'http://plc.test' });
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
