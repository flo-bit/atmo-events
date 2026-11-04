import { afterEach, describe, expect, it, vi } from 'vitest';
import { variables } from '../../env';
import { networkSettingsFrom } from './cli.config';
import { contrailNetworkOf } from '../atproto/network-settings';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

/** The config contrail's CLI loads, in a shell with only these network settings. */
async function cliConfig(settings: Record<string, string>) {
	vi.resetModules();
	for (const name of Object.keys(variables)) vi.stubEnv(name, settings[name] ?? '');
	return (await import('./cli.config')).config;
}

describe('the config contrail’s CLI loads', () => {
	it('is the app’s config on contrail’s defaults when no network is set', async () => {
		const cli = await cliConfig({});
		const { config: appConfig } = await import('../contrail.config');
		expect(cli).toEqual({ ...appConfig, networkOverrides: {} });
	});

	it('reads the network its shell names', async () => {
		const cli = await cliConfig({
			PUBLIC_RELAY_URLS: 'http://relay.test, http://relay2.test',
			PUBLIC_JETSTREAM_URL: 'ws://jetstream.test',
			PUBLIC_SLINGSHOT_URL: 'http://slingshot.test',
			PUBLIC_CONSTELLATION_URL: 'http://constellation.test',
			PUBLIC_PLC_URL: 'http://plc.test'
		});
		expect(cli).toMatchObject({
			relays: ['http://relay.test', 'http://relay2.test'],
			jetstreams: ['ws://jetstream.test'],
			constellation: { url: 'http://constellation.test' },
			networkOverrides: {
				slingshotUrl: 'http://slingshot.test/xrpc/com.bad-example.identity.resolveMiniDoc'
			}
		});
		expect(cli.networkOverrides?.resolver).toBeDefined();
	});

	it('refuses a setting src/env.ts refuses, naming it', async () => {
		await expect(cliConfig({ PUBLIC_PLC_URL: 'plc.test' })).rejects.toThrow(/^PUBLIC_PLC_URL: /);
	});
});

describe('networkSettingsFrom', () => {
	it('gives contrail what the Worker gives it for the same settings', () => {
		expect(
			contrailNetworkOf(networkSettingsFrom({ PUBLIC_RELAY_URLS: 'https://relay.test' }))
		).toEqual(contrailNetworkOf({ PUBLIC_RELAY_URLS: ['https://relay.test'] }));
	});

	it('ignores values that are not text', () => {
		expect(networkSettingsFrom({ PUBLIC_RELAY_URLS: { prepare() {} } })).toMatchObject({
			PUBLIC_RELAY_URLS: undefined
		});
	});
});
