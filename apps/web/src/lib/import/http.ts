export const FETCH_HEADERS = {
	'User-Agent': 'atmo.rsvp/0.1 (+https://atmo.rsvp)',
	Accept: 'text/html,text/calendar,application/json;q=0.9,*/*;q=0.8'
};

export const MAX_BYTES = 2 * 1024 * 1024;
// 3 MB raw cap → ~4 MB base64. Most event cover images are well under this; we
// stash the result in sessionStorage on the client, which has its own limits.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

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
		if (!res.ok) return undefined;
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
