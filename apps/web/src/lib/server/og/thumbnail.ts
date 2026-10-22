const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/** An unusable response; `status` is set when the server answered. */
export class ImageFetchError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
	}
}
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Bound remote image I/O before handing the bytes to the renderer. */
export async function loadThumbnail(
	url: string,
	{ types = RASTER_TYPES, maxBytes = MAX_THUMBNAIL_BYTES } = {}
): Promise<Uint8Array> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		const type = response.headers.get('content-type')?.split(';')[0].trim();
		if (!response.ok || !response.body || !types.includes(type ?? '')) {
			await response.body?.cancel();
			throw new ImageFetchError('OG thumbnail unavailable', response.status);
		}
		if (Number(response.headers.get('content-length')) > maxBytes) {
			await response.body.cancel();
			throw new Error('OG thumbnail exceeds size limit');
		}
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > maxBytes) throw new Error('OG thumbnail exceeds size limit');
				chunks.push(value);
			}
		} catch (cause) {
			await reader.cancel().catch(() => {});
			throw cause;
		} finally {
			reader.releaseLock();
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return bytes;
	} finally {
		clearTimeout(timeout);
	}
}
