import { defineEnvVars } from '@sveltejs/kit/env';

// Every atproto network address atmo uses, each named after its service. All are optional:
// unset, each is the public network's address, so nothing changes until a deployment sets
// one. Setting them points atmo at another atproto network, such as a local test network.
// Public, because the browser reads the same addresses as the server.

function url(...protocols: string[]) {
	return (value: string | undefined) => {
		const v = value?.trim();
		if (!v) return undefined;
		if (!protocols.includes(new URL(v).protocol)) {
			throw new Error(`must be a ${protocols.join(' or ')} URL`);
		}
		return v;
	};
}

function urls(...protocols: string[]) {
	const one = url(...protocols);
	return (value: string | undefined) => {
		const list = value
			?.split(',')
			.map(one)
			.filter((v) => v !== undefined);
		return list?.length ? list : undefined;
	};
}

const web = url('https:', 'http:');

export const variables = defineEnvVars({
	PUBLIC_PLC_URL: {
		public: true,
		schema: web,
		description: 'PLC directory, for did:plc documents.'
	},
	PUBLIC_DOH_URL: {
		public: true,
		schema: web,
		description: 'DNS-over-HTTPS resolver, for handles.'
	},
	PUBLIC_SLINGSHOT_URL: {
		public: true,
		schema: web,
		description: 'Slingshot identity and record cache.'
	},
	PUBLIC_CONSTELLATION_URL: {
		public: true,
		schema: web,
		description: 'Constellation backlink index.'
	},
	PUBLIC_APPVIEW_URL: {
		public: true,
		schema: web,
		description: 'Bluesky API, for comments and handle search.'
	},
	PUBLIC_CDN_URL: {
		public: true,
		schema: web,
		description: 'Image CDN, serving /img/<preset>/plain/<did>/<cid>@<format>.'
	},
	PUBLIC_JETSTREAM_URL: {
		public: true,
		schema: url('wss:', 'ws:'),
		description: 'Jetstream that contrail ingests from.'
	},
	PUBLIC_RELAY_URLS: {
		public: true,
		schema: urls('https:', 'http:'),
		description: 'Relays that contrail backfills from, comma-separated.'
	},
	PUBLIC_SIGNUP_PDS_URL: {
		public: true,
		schema: web,
		description: 'PDS where the sign-up button creates accounts.'
	}
});
