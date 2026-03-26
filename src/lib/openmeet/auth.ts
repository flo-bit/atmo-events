import type { Client } from '@atcute/client';
import type { OpenMeetTokens } from './types';
import { exchangeServiceAuth } from './client';

const OPENMEET_SERVICE_DID = import.meta.env.VITE_OPENMEET_SERVICE_DID || 'did:web:api.openmeet.net';

/**
 * Authenticate to OpenMeet using the user's ATProto session.
 *
 * Flow: getServiceAuth (PDS signs a JWT) → exchange at OpenMeet → get session tokens.
 * The user's signing key never leaves their PDS.
 *
 * We exchange for OpenMeet tokens rather than passing PDS service auth tokens
 * directly to each API call because PDS tokens are short-lived (~60s). The
 * exchange gives us a ~60min token we can cache, avoiding a PDS round-trip on
 * every page load. The alternative — accepting PDS tokens directly on the DID
 * API — would be simpler (no exchange, no session) but adds latency per request.
 */
export async function connectToOpenMeet(client: Client): Promise<OpenMeetTokens | null> {
	try {
		// Ask the user's PDS to sign a service auth token for OpenMeet
		const response = await client.get('com.atproto.server.getServiceAuth', {
			params: {
				aud: OPENMEET_SERVICE_DID,
				lxm: 'net.openmeet.auth'
			}
		});

		// response.data is typed as { token: string } | XRPCErrorPayload
		const token = (response.data as Record<string, unknown>).token as string | undefined;
		if (!token) {
			console.error('OpenMeet connect: PDS response:', JSON.stringify(response));
			return null;
		}

		// Exchange PDS-signed token for OpenMeet session tokens
		const tokens = await exchangeServiceAuth(token);
		if (!tokens) {
			console.error('OpenMeet connect: token exchange failed');
			return null;
		}

		return tokens;
	} catch (err: unknown) {
		const detail = err instanceof Error ? err.message : JSON.stringify(err);
		console.error('OpenMeet connect failed:', detail);
		return null;
	}
}
