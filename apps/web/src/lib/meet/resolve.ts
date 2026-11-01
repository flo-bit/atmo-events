import { isDid } from '@atcute/lexicons/syntax';

/** Resolve handles without navigating away from (or restarting) the camera. */
export async function resolveMeetingActor(actor: string): Promise<string> {
	if (isDid(actor)) return actor;
	const url = new URL('/api/meet/resolve', window.location.origin);
	url.searchParams.set('actor', actor);
	const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
	if (response.ok) {
		const result: unknown = await response.json();
		if (result && typeof result === 'object' && 'did' in result && isDid(result.did))
			return result.did;
	}
	throw new Error('Could not resolve that handle. Check it or try their DID.');
}
