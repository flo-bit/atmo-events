import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { LIKE_COLLECTION, POST_COLLECTION } from './config';

export type PostRef = { uri: string; cid: string };

const encoder = new TextEncoder();
const URL_RE = /https?:\/\/[^\s)\]]+/g;

/** Build `#link` facets for any URLs in `text`, using UTF-8 byte offsets. */
function buildLinkFacets(text: string) {
	const facets: Array<{
		index: { byteStart: number; byteEnd: number };
		features: Array<{ $type: 'app.bsky.richtext.facet#link'; uri: string }>;
	}> = [];

	for (const match of text.matchAll(URL_RE)) {
		// Trim trailing punctuation that's part of the sentence, not the URL.
		const uri = match[0].replace(/[.,;:!?]+$/, '');
		const byteStart = encoder.encode(text.slice(0, match.index)).length;
		const byteEnd = byteStart + encoder.encode(uri).length;
		facets.push({
			index: { byteStart, byteEnd },
			features: [{ $type: 'app.bsky.richtext.facet#link', uri }]
		});
	}

	return facets.length ? facets : undefined;
}

/** Like a post as the bot (confirms a successful RSVP). */
export async function likePost(client: Client, botDid: Did, subject: PostRef): Promise<void> {
	await client.post('com.atproto.repo.createRecord', {
		input: {
			repo: botDid,
			collection: LIKE_COLLECTION,
			record: {
				$type: LIKE_COLLECTION,
				subject,
				createdAt: new Date().toISOString()
			}
		}
	});
}

/** Reply to a post as the bot. `root`/`parent` thread the reply correctly. */
export async function replyToPost(
	client: Client,
	botDid: Did,
	opts: { root: PostRef; parent: PostRef; text: string }
): Promise<void> {
	const facets = buildLinkFacets(opts.text);
	await client.post('com.atproto.repo.createRecord', {
		input: {
			repo: botDid,
			collection: POST_COLLECTION,
			record: {
				$type: POST_COLLECTION,
				text: opts.text,
				createdAt: new Date().toISOString(),
				reply: { root: opts.root, parent: opts.parent },
				...(facets ? { facets } : {})
			}
		}
	});
}
