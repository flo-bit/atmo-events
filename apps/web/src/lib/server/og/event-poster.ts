import { getEventExternalImage } from '@atmo-dev/kit/events-data';
import { loadThumbnail } from './thumbnail';

/** Only fetch known poster storage, never arbitrary record-supplied URLs. */
export async function loadEventPoster(event: Parameters<typeof getEventExternalImage>[0]) {
	const image = getEventExternalImage(event);
	if (!image) return null;
	const url = new URL(image.url);
	if (
		url.origin !== 'https://laugh.town' ||
		!/^\/cdn\/(?:p|img)\/posters\/[a-f0-9]{16}\.webp$/.test(url.pathname)
	)
		return null;
	try {
		return await loadThumbnail(url.href, { redirect: 'error' });
	} catch {
		// A missing poster should not prevent an otherwise valid preview.
		return null;
	}
}
