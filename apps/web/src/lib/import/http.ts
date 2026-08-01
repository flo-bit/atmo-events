export const FETCH_HEADERS = {
	'User-Agent': 'atmo.rsvp/0.1 (+https://atmo.rsvp)',
	Accept: 'text/html,text/calendar,application/json;q=0.9,*/*;q=0.8'
};

export const MAX_BYTES = 2 * 1024 * 1024;
// 3 MB raw cap → ~4 MB base64. Most event cover images are well under this; we
// stash the result in sessionStorage on the client, which has its own limits.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * A non-OK response from a source we fetched.
 *
 * Carries the three fields a failed import needs to be diagnosable from a single
 * log line: the status, the URL after redirects, and the content-type (a wrong
 * content-type is the other way this path fails quietly). They are repeated in
 * the message on purpose, because a thrown Error is usually rendered by its
 * stack alone and fields hung off it never reach the log.
 */
export class UpstreamError extends Error {
	readonly status: number;
	readonly finalUrl: string;
	readonly contentType: string;

	constructor(status: number, finalUrl: string, contentType = '') {
		super(`upstream ${status} for ${finalUrl}${contentType ? ` (${contentType})` : ''}`);
		this.name = 'UpstreamError';
		this.status = status;
		this.finalUrl = finalUrl;
		this.contentType = contentType;
	}
}

/**
 * Turn a non-OK upstream status into something the person pasting a URL can act
 * on. Lives here, next to the error, so it is the one place this copy is written
 * and callers (and their tests) never restate it.
 */
export function describeUpstream(status: number, host: string): string {
	if (status === 429) return `${host} is rate limiting us right now. Wait a minute and try again.`;
	if (status === 401 || status === 403) {
		return `${host} would not let us read that page. It may be private or need a login.`;
	}
	if (status === 404) return `${host} has no page at that address.`;
	if (status >= 500) return `${host} is having trouble right now. Try again later.`;
	return `${host} refused that address (HTTP ${status}).`;
}

/**
 * Build an `UpstreamError` from a response. `res.url` is empty on some runtimes,
 * so the requested URL is the fallback.
 */
export function upstreamError(res: Response, requestedUrl: string): UpstreamError {
	return new UpstreamError(
		res.status,
		res.url || requestedUrl,
		(res.headers.get('content-type') || '').toLowerCase()
	);
}

/** Read a response body as text, stopping once `max` bytes have been consumed. */
export async function readLimited(res: Response, max: number): Promise<string> {
	const reader = res.body?.getReader();
	if (!reader) return await res.text();
	const decoder = new TextDecoder();
	let received = 0;
	let out = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > max) {
			out += decoder.decode(value.subarray(0, Math.max(0, max - (received - value.byteLength))));
			try {
				await reader.cancel();
			} catch {
				/* ignore */
			}
			break;
		}
		out += decoder.decode(value, { stream: true });
	}
	out += decoder.decode();
	return out;
}

/** Fetch an image and return it as a base64 data URL, or undefined on failure / oversize. */
export async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
	try {
		const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
		if (!res.ok) {
			// The cover image is optional, so this stays non-fatal. It still gets a
			// line: an import that silently arrives without its image was previously
			// indistinguishable from a source that has no image at all.
			console.warn('import: cover image fetch failed:', upstreamError(res, url).message);
			return undefined;
		}
		const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
		if (!contentType.startsWith('image/')) return undefined;

		const reader = res.body?.getReader();
		if (!reader) {
			const buf = new Uint8Array(await res.arrayBuffer());
			if (buf.byteLength > MAX_IMAGE_BYTES) return undefined;
			return `data:${contentType};base64,${bytesToBase64(buf)}`;
		}
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_IMAGE_BYTES) {
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
				return undefined;
			}
			chunks.push(value);
		}
		const merged = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			merged.set(c, off);
			off += c.byteLength;
		}
		return `data:${contentType};base64,${bytesToBase64(merged)}`;
	} catch (err) {
		console.error('fetchImageAsDataUrl failed:', url, err);
		return undefined;
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	// btoa expects a binary string; build in chunks to avoid hitting argument
	// limits with String.fromCharCode on multi-MB buffers.
	let s = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		s += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
		);
	}
	return btoa(s);
}
