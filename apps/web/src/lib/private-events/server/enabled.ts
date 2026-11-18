import { env } from 'cloudflare:workers';

/** Off unless a deployment turns it on: it needs people on a PDS with spaces support, and the
 *  space type published where their PDS can find it. Turning it back off takes its scopes out of the
 *  sign-in, so anyone who already granted them can't be asked for a new permission, such as Bluesky
 *  posting or meetings, until they sign in again: the OAuth library rejects their requested scopes
 *  as undeclared. */
export function privateEventsEnabled(): boolean {
	return env.PRIVATE_EVENTS === 'true';
}

/** A PDS with spaces support to point people at; null when the deployment names none. */
export function spacesServer(): { url: string; host: string } | null {
	const value = env.SPACES_PDS_URL?.trim();
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? { url: url.href, host: url.host } : null;
	} catch {
		return null;
	}
}
