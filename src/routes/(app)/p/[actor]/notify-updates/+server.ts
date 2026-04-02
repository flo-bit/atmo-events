import { error, json } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import { isActorIdentifier, type ResourceUri } from '@atcute/lexicons/syntax';
import type { Did } from '@atcute/lexicons';
import { getServerClient } from '$lib/contrail';
import { listRecords } from '$lib/atproto/methods';

export async function GET({ params, platform }) {
	const client = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) {
		throw error(404, 'Not found');
	}

	const did = await getActor(params.actor);

	if (!did) {
		throw error(404, 'Not found');
	}

	// List records directly from the PDS
	const records = await listRecords({
		did: did as Did,
		collection: 'community.lexicon.calendar.event',
		limit: 0
	});

	const uris = records.map((r) => r.uri);

	console.log(`[notify-updates] Found ${uris.length} events on PDS for ${params.actor}`);
	for (const uri of uris) {
		console.log(`[notify-updates]   - ${uri}`);
	}

	let totalIndexed = 0;
	let totalDeleted = 0;
	const allErrors: string[] = [];

	// Batch in groups of 25 (API limit)
	for (let i = 0; i < uris.length; i += 25) {
		const batch = uris.slice(i, i + 25);
		const batchNum = Math.floor(i / 25) + 1;
		try {
			const result = await client.post('rsvp.atmo.notifyOfUpdate', {
				input: { uris: batch as ResourceUri[] }
			});
			if (result.ok) {
				console.log(
					`[notify-updates] Batch ${batchNum} (${batch.length} uris): indexed=${result.data.indexed}, deleted=${result.data.deleted}${result.data.errors?.length ? `, errors=${JSON.stringify(result.data.errors)}` : ''}`
				);
				totalIndexed += result.data.indexed;
				totalDeleted += result.data.deleted;
				if (result.data.errors) allErrors.push(...result.data.errors);
			} else {
				console.log(`[notify-updates] Batch ${batchNum}: request failed (not ok)`);
				allErrors.push(`Batch ${batchNum} returned non-ok response`);
			}
		} catch (e) {
			console.error(`[notify-updates] Batch ${batchNum} threw:`, e);
			allErrors.push(`Batch ${batchNum} (index ${i}) failed`);
		}
	}

	console.log(
		`[notify-updates] Done: total=${uris.length}, indexed=${totalIndexed}, deleted=${totalDeleted}, errors=${allErrors.length}`
	);

	return json({
		total: uris.length,
		indexed: totalIndexed,
		deleted: totalDeleted,
		errors: allErrors.length > 0 ? allErrors : undefined
	});
}
