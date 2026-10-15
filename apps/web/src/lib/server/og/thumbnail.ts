const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/** Bound remote image I/O before handing a data URI to Satori. */
export async function loadThumbnail(url: string): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		const type = response.headers.get('content-type')?.split(';')[0].trim();
		if (
			!response.ok ||
			!response.body ||
			!['image/png', 'image/jpeg', 'image/webp'].includes(type ?? '')
		) {
			await response.body?.cancel();
			throw new Error('OG thumbnail unavailable');
		}
		if (Number(response.headers.get('content-length')) > MAX_THUMBNAIL_BYTES) {
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
				if (size > MAX_THUMBNAIL_BYTES) throw new Error('OG thumbnail exceeds size limit');
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
		// Avoid spreading a multi-megabyte buffer onto the JS argument stack.
		let binary = '';
		for (let i = 0; i < bytes.length; i += 8192) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
		}
		return `data:${type};base64,${btoa(binary)}`;
	} finally {
		clearTimeout(timeout);
	}
}
