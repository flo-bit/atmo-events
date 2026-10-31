import '../../lexicon-types/index.js';
import type { Client } from '@atcute/client';
import type { Did, ResourceUri } from '@atcute/lexicons';
import { isDid, isHandle } from '@atcute/lexicons/syntax';
import { tokenize } from '@atcute/bluesky-richtext-parser';
import { error } from '@sveltejs/kit';
import { MAX_MEMBERS, parseEventUri, type PackSource } from './service';
import { withDeadline } from './deadline';

const SOURCE_BUDGET_MS = 10_000;
const MENTION_CONCURRENCY = 4;

/** Deliberately fail closed: the UI's best-effort/200-person preview is not a sync source. */
export async function loadPackSource(
	index: Client,
	resolver: Client,
	uri: string,
	parent?: AbortSignal
): Promise<PackSource> {
	return withDeadline(SOURCE_BUDGET_MS, parent, (signal) =>
		loadSource(index, resolver, uri, signal)
	);
}

async function loadSource(
	index: Client,
	resolver: Client,
	uri: string,
	signal: AbortSignal
): Promise<PackSource> {
	const { did } = parseEventUri(uri);
	const response = await index.get('rsvp.atmo.event.getRecord', {
		params: { uri: uri as ResourceUri },
		signal
	});
	signal.throwIfAborted();
	if (!response.ok) {
		if (response.data.error === 'RecordNotFound' || response.status === 404)
			error(404, 'Event not found');
		error(503, 'Could not load event');
	}
	const value = response.data.value as unknown as {
		name?: string;
		description?: string;
		facets?: Array<{
			index?: { byteStart: number; byteEnd: number };
			features?: Array<{ $type?: string; did?: string }>;
		}>;
	};
	if (!value || typeof value.name !== 'string' || response.data.uri !== uri)
		error(404, 'Event not found');
	const mentions = new Set<Did>();
	const coveredMentions = new Set<string>();
	for (const facet of value.facets ?? []) {
		for (const feature of facet.features ?? []) {
			if (
				feature.$type === 'app.bsky.richtext.facet#mention' &&
				feature.did &&
				isDid(feature.did)
			) {
				mentions.add(feature.did);
				if (facet.index) coveredMentions.add(`${facet.index.byteStart}:${facet.index.byteEnd}`);
			}
		}
	}
	// Resolve only unfaceted mention tokens, including partially-faceted imports.
	// Existing facets remain authoritative after someone changes/reassigns a handle.
	if (value.description) {
		const handles = new Set<string>();
		let byteOffset = 0;
		for (const token of tokenize(value.description)) {
			const end = byteOffset + new TextEncoder().encode(token.raw).length;
			if (token.type === 'mention' && !coveredMentions.has(`${byteOffset}:${end}`))
				handles.add(token.handle);
			byteOffset = end;
		}
		// Bound concurrency and total elapsed time, not just each individual request.
		// Keep results in description order: response timing must not change which
		// mentions get priority when a pack reaches its membership cap.
		const pending = [...handles].slice(0, MAX_MEMBERS).filter(isHandle);
		const resolvedDids: Array<Did | undefined> = new Array(pending.length);
		let next = 0;
		await Promise.all(
			Array.from({ length: Math.min(MENTION_CONCURRENCY, pending.length) }, async () => {
				while (next < pending.length) {
					signal.throwIfAborted();
					const position = next++;
					const resolved = await withDeadline(5_000, signal, (requestSignal) =>
						resolver.get('com.atproto.identity.resolveHandle', {
							params: { handle: pending[position] },
							signal: requestSignal
						})
					);
					if (resolved.ok) resolvedDids[position] = resolved.data.did;
					else if (
						resolved.data.error !== 'HandleNotFound' &&
						resolved.data.error !== 'InvalidHandle'
					) {
						throw new Error('Could not resolve description mentions');
					}
				}
			})
		);
		for (const did of resolvedDids) if (did) mentions.add(did);
	}

	const attendees = new Set<Did>();
	const seenDids = new Set<Did>();
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	do {
		signal.throwIfAborted();
		const page = await index.get('rsvp.atmo.rsvp.listRecords', {
			params: { subjectUri: uri, limit: 200, order: 'desc', cursor },
			signal
		});
		signal.throwIfAborted();
		if (!page.ok) throw new Error('Could not load complete RSVP list');
		for (const record of page.data.records) {
			// The newest indexed RSVP wins if an account published several records.
			if (seenDids.has(record.did)) continue;
			seenDids.add(record.did);
			if (
				record.value.status === 'community.lexicon.calendar.rsvp#going' ||
				record.value.status === 'community.lexicon.calendar.rsvp#interested'
			)
				attendees.add(record.did);
		}
		cursor = page.data.cursor;
		if (cursor && (seenCursors.has(cursor) || seenCursors.size >= 1000))
			throw new Error('Incomplete RSVP pagination');
		if (cursor) seenCursors.add(cursor);
	} while (cursor);
	return {
		uri,
		host: did,
		name: value.name,
		mentions: [...mentions],
		attendees: [...attendees].sort()
	};
}
