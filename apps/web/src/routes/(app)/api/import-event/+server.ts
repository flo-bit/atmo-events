import { json } from '@sveltejs/kit';
import { fetchImageAsDataUrl, importFromUrl } from '$lib/import';

export async function POST({ request, locals }) {
	if (!locals.did) {
		return json({ error: 'You must be signed in to import events.' }, { status: 401 });
	}

	let body: { url?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const rawUrl = body.url?.trim();
	if (!rawUrl) return json({ error: 'url is required' }, { status: 400 });

	// webcal:// is the de-facto scheme for calendar subscription links; rewrite it
	// to https so a .ics feed can be pasted exactly as a calendar app hands it out.
	const sourceUrl = rawUrl.replace(/^webcal:\/\//i, 'https://');

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(sourceUrl);
	} catch {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}
	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		return json({ error: 'Only http(s) URLs are supported' }, { status: 400 });
	}

	try {
		const result = await importFromUrl(sourceUrl);
		if (!result) {
			return json({ error: 'Could not find event data on that page.' }, { status: 422 });
		}
		if (result.imageUrl && !result.imageDataUrl) {
			const image = await fetchImageAsDataUrl(result.imageUrl);
			if (image) result.imageDataUrl = image;
		}
		return json(result);
	} catch (err) {
		console.error('import-event failed:', sourceUrl, err);
		return json({ error: 'Failed to fetch or parse that URL.' }, { status: 502 });
	}
}
