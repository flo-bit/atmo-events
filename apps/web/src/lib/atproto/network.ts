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
	createAtprotoNetwork,
	createDidDocumentResolver,
	requiredEndpoint,
	type AtprotoNetwork,
	type NetworkEndpoint
} from '@svelte-atproto/oauth/network';

let profile: AtprotoNetwork | undefined;

/** The atproto network this deployment uses: the public one, except for any
 * address a setting names (src/env.ts). Pass it to the OAuth library's calls. */
export function atprotoNetwork(): AtprotoNetwork {
	return (profile ??= createAtprotoNetwork({
		plc: PUBLIC_PLC_URL,
		doh: PUBLIC_DOH_URL,
		slingshot: PUBLIC_SLINGSHOT_URL,
		constellation: PUBLIC_CONSTELLATION_URL,
		appview: PUBLIC_APPVIEW_URL,
		cdn: PUBLIC_CDN_URL
	}));
}

/** One service's address on this network, without a trailing slash. */
export function serviceUrl(name: NetworkEndpoint): string {
	return requiredEndpoint({ network: atprotoNetwork() }, name);
}

// Contrail adds `?identifier=` to the Slingshot URL it is given, so it takes the method's
// URL: given the service's root, every lookup gets Slingshot's home page and fails quietly.
const RESOLVE_MINI_DOC = '/xrpc/com.bad-example.identity.resolveMiniDoc';

/** The same network, in contrail's settings. Unset addresses keep contrail's defaults. */
export function contrailNetwork(): Pick<
	ContrailConfig,
	'jetstreams' | 'relays' | 'constellation' | 'networkOverrides'
> {
	const network = atprotoNetwork();
	return {
		...(PUBLIC_JETSTREAM_URL ? { jetstreams: [PUBLIC_JETSTREAM_URL] } : {}),
		...(PUBLIC_RELAY_URLS ? { relays: PUBLIC_RELAY_URLS } : {}),
		...(PUBLIC_CONSTELLATION_URL ? { constellation: { url: serviceUrl('constellation') } } : {}),
		networkOverrides: {
			...(PUBLIC_SLINGSHOT_URL ? { slingshotUrl: serviceUrl('slingshot') + RESOLVE_MINI_DOC } : {}),
			...(PUBLIC_PLC_URL ? { resolver: createDidDocumentResolver({ network }) } : {})
		}
	};
}
