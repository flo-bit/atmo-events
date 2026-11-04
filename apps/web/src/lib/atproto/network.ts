import {
	PUBLIC_APPVIEW_URL,
	PUBLIC_CDN_URL,
	PUBLIC_CONSTELLATION_URL,
	PUBLIC_DOH_URL,
	PUBLIC_JETSTREAM_URL,
	PUBLIC_PLC_URL,
	PUBLIC_RELAY_URLS,
	PUBLIC_SLINGSHOT_URL
} from '$app/env/public';
import type { ContrailConfig } from '@atmo-dev/contrail';
import {
	requiredEndpoint,
	type AtprotoNetwork,
	type NetworkEndpoint
} from '@svelte-atproto/oauth/network';
import { contrailNetworkOf, networkOf, type NetworkSettings } from './network-settings';

function settings(): NetworkSettings {
	return {
		PUBLIC_PLC_URL,
		PUBLIC_DOH_URL,
		PUBLIC_SLINGSHOT_URL,
		PUBLIC_CONSTELLATION_URL,
		PUBLIC_APPVIEW_URL,
		PUBLIC_CDN_URL,
		PUBLIC_JETSTREAM_URL,
		PUBLIC_RELAY_URLS
	};
}

let profile: AtprotoNetwork | undefined;

/** The atproto network this deployment uses: the public one, except for any
 * address a setting names (src/env.ts). Pass it to the OAuth library's calls. */
export function atprotoNetwork(): AtprotoNetwork {
	return (profile ??= networkOf(settings()));
}

/** One service's address on this network, without a trailing slash. */
export function serviceUrl(name: NetworkEndpoint): string {
	return requiredEndpoint({ network: atprotoNetwork() }, name);
}

/** The same network, in contrail's settings. Unset addresses keep contrail's defaults. */
export function contrailNetwork(): Pick<
	ContrailConfig,
	'jetstreams' | 'relays' | 'constellation' | 'networkOverrides'
> {
	return contrailNetworkOf(settings());
}
