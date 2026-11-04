import type { ContrailConfig } from '@atmo-dev/contrail';
import {
	createAtprotoNetwork,
	createDidDocumentResolver,
	requiredEndpoint,
	type AtprotoNetwork,
	type NetworkEndpoint
} from '@svelte-atproto/oauth/network';

// No $app imports here: contrail's CLI loads this outside SvelteKit (contrail/cli.config.ts).

/** The network settings in src/env.ts once checked, as $app/env/public gives them. */
export interface NetworkSettings {
	PUBLIC_PLC_URL?: string;
	PUBLIC_DOH_URL?: string;
	PUBLIC_SLINGSHOT_URL?: string;
	PUBLIC_CONSTELLATION_URL?: string;
	PUBLIC_APPVIEW_URL?: string;
	PUBLIC_CDN_URL?: string;
	PUBLIC_JETSTREAM_URL?: string;
	PUBLIC_RELAY_URLS?: string[];
}

/** The atproto network these settings name: the public one, except for any address set. */
export function networkOf(settings: NetworkSettings): AtprotoNetwork {
	return createAtprotoNetwork({
		plc: settings.PUBLIC_PLC_URL,
		doh: settings.PUBLIC_DOH_URL,
		slingshot: settings.PUBLIC_SLINGSHOT_URL,
		constellation: settings.PUBLIC_CONSTELLATION_URL,
		appview: settings.PUBLIC_APPVIEW_URL,
		cdn: settings.PUBLIC_CDN_URL
	});
}

// Contrail adds `?identifier=` to the Slingshot URL it is given, so it takes the method's
// URL: given the service's root, every lookup gets Slingshot's home page and fails quietly.
const RESOLVE_MINI_DOC = '/xrpc/com.bad-example.identity.resolveMiniDoc';

/** The same network, in contrail's settings. Unset addresses keep contrail's defaults. */
export function contrailNetworkOf(
	settings: NetworkSettings
): Pick<ContrailConfig, 'jetstreams' | 'relays' | 'constellation' | 'networkOverrides'> {
	const network = networkOf(settings);
	const url = (name: NetworkEndpoint) => requiredEndpoint({ network }, name);
	return {
		...(settings.PUBLIC_JETSTREAM_URL ? { jetstreams: [settings.PUBLIC_JETSTREAM_URL] } : {}),
		...(settings.PUBLIC_RELAY_URLS ? { relays: settings.PUBLIC_RELAY_URLS } : {}),
		...(settings.PUBLIC_CONSTELLATION_URL ? { constellation: { url: url('constellation') } } : {}),
		networkOverrides: {
			...(settings.PUBLIC_SLINGSHOT_URL
				? { slingshotUrl: url('slingshot') + RESOLVE_MINI_DOC }
				: {}),
			...(settings.PUBLIC_PLC_URL ? { resolver: createDidDocumentResolver({ network }) } : {})
		}
	};
}
