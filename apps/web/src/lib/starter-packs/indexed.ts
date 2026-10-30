import type { Client } from '@atcute/client';
import type { ResourceUri } from '@atcute/lexicons';

/** Avoid opening a just-published pack before Bluesky has indexed it. Publication
 * has already succeeded, so a slow AppView must never turn this into a write retry. */
export async function waitForPackIndex(client: Client, url: string): Promise<void> {
	const [, , did, rkey] = new URL(url).pathname.split('/');
	const uri = `at://${did}/app.bsky.graph.starterpack/${rkey}` as ResourceUri;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const response = await client.get('app.bsky.graph.getStarterPack', {
				params: { starterPack: uri },
				signal: AbortSignal.timeout(1_500)
			});
			if (response.ok) return;
		} catch {
			// The record still exists on the PDS; tolerate an unavailable AppView.
		}
		if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 400));
	}
	console.warn('[starter-packs] published pack is not yet visible in Bluesky', uri);
}
