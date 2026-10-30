import { defineEnvVars } from '@sveltejs/kit/env';

// Every atproto network address atmo uses, each named after its service. All are optional:
// unset, each is the public network's address, so nothing changes until a deployment sets
// one. Setting them points atmo at another atproto network, such as a local test network.
// Public, because the browser reads the same addresses as the server.

function url(...protocols: string[]) {
	return (value: string | undefined) => {
		const v = value?.trim();
		if (!v) return undefined;
		const parsed = new URL(v);
		if (!protocols.includes(parsed.protocol)) {
			throw new Error(`must be a ${protocols.join(' or ')} URL`);
		}
		// The address is used as written. The URL parser forgives https:host and https:/host, but
		// a browser reads a link built from either as a path on atmo's own site.
		if (!v.toLowerCase().startsWith(`${parsed.protocol}//`)) {
			throw new Error(`must start with ${parsed.protocol}//`);
		}
		// The URL parser reads a backslash as a slash, but a URL built from the address as text
		// keeps it, so the consumers that parse and the ones that append would disagree.
		if (v.includes('\\')) throw new Error('must not have a backslash');
		// The OAuth library refuses these too, but only when it is first used. An empty # counts,
		// since it would still cut off every path added after it.
		if (parsed.username || parsed.password || v.includes('#')) {
			throw new Error('must not have a user, password or #fragment');
		}
		return v;
	};
}

// For a service whose consumers add the path themselves. Some of them keep a path the address
// has and some drop it (`new URL('/xrpc/…', address)`), so a path would mean something
// different to each.
function origin(...protocols: string[]) {
	const one = url(...protocols);
	return (value: string | undefined) => {
		const v = one(value);
		if (v) {
			// An empty ? has no search, but would still land in the middle of every URL.
			if (new URL(v).pathname !== '/' || v.includes('?')) {
				throw new Error('must be an origin, with no path');
			}
		}
		return v;
	};
}

// For a service whose consumers append to the address as text, so a ?query would land in the
// middle of every URL they build. A path works.
function noQuery(...protocols: string[]) {
	const one = url(...protocols);
	return (value: string | undefined) => {
		const v = one(value);
		if (v?.includes('?')) throw new Error('must not have a ?query');
		return v;
	};
}

function list(one: (value: string | undefined) => string | undefined) {
	return (value: string | undefined) => {
		const all = value
			?.split(',')
			.map(one)
			.filter((v) => v !== undefined);
		return all?.length ? all : undefined;
	};
}

const service = origin('https:', 'http:');

export const variables = defineEnvVars({
	PUBLIC_PLC_URL: {
		public: true,
		schema: service,
		description: 'PLC directory, for did:plc documents.'
	},
	PUBLIC_DOH_URL: {
		public: true,
		schema: url('https:', 'http:'),
		description: 'DNS-over-HTTPS resolver, for handles.'
	},
	PUBLIC_SLINGSHOT_URL: {
		public: true,
		schema: noQuery('https:', 'http:'),
		description: 'Slingshot identity and record cache.'
	},
	PUBLIC_CONSTELLATION_URL: {
		public: true,
		schema: service,
		description: 'Constellation backlink index.'
	},
	PUBLIC_APPVIEW_URL: {
		public: true,
		schema: service,
		description: 'Bluesky API, for comments and handle search.'
	},
	PUBLIC_CDN_URL: {
		public: true,
		schema: noQuery('https:', 'http:'),
		description: 'Image CDN, serving /img/<preset>/plain/<did>/<cid>@<format>.'
	},
	PUBLIC_JETSTREAM_URL: {
		public: true,
		schema: origin('https:', 'http:', 'wss:', 'ws:'),
		description: 'Jetstream that contrail ingests from, as an origin (no /subscribe).'
	},
	PUBLIC_RELAY_URLS: {
		public: true,
		schema: list(service),
		description: 'Relays that contrail backfills from, comma-separated.'
	},
	// HTTPS only: the OAuth library refuses an http PDS, but only once someone signs up, with a
	// bare 400 that names nothing.
	PUBLIC_SIGNUP_PDS_URL: {
		public: true,
		schema: origin('https:'),
		description: 'PDS where the sign-up button creates accounts, over HTTPS.'
	}
});
