/**
 * Matches ATmosphereConf events to stream.place VODs by title.
 * Outputs a JSON mapping to src/lib/vod-map.json.
 *
 * Usage: npx tsx scripts/match-vods.ts
 */

const STREAM_PLACE_DID = 'did:plc:rbvrr34edl5ddpuwcubjiost';
const STREAM_PLACE_PDS = 'https://iameli.com';
const VOD_COLLECTION = 'place.stream.video';
const CONTRAIL_URL = 'http://contrail.atmo.rsvp';

interface VodRecord {
	uri: string;
	rkey: string;
	title: string;
}

interface EventRecord {
	uri: string;
	rkey: string;
	name: string;
	type?: string;
}

interface VodMapping {
	eventRkey: string;
	eventTitle: string;
	vodRkey: string;
	vodTitle: string;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function extractRkey(uri: string): string {
	return uri.split('/').pop()!;
}

async function fetchAllVods(): Promise<VodRecord[]> {
	const all: VodRecord[] = [];
	let cursor: string | undefined;

	do {
		const params = new URLSearchParams({
			repo: STREAM_PLACE_DID,
			collection: VOD_COLLECTION,
			limit: '100'
		});
		if (cursor) params.set('cursor', cursor);

		const res = await fetch(`${STREAM_PLACE_PDS}/xrpc/com.atproto.repo.listRecords?${params}`);
		if (!res.ok) break;

		const data = (await res.json()) as {
			cursor?: string;
			records: Array<{ uri: string; value: { title: string } }>;
		};

		for (const r of data.records ?? []) {
			all.push({
				uri: r.uri,
				rkey: extractRkey(r.uri),
				title: r.value.title
			});
		}
		cursor = data.cursor;
	} while (cursor);

	return all;
}

async function fetchAllEvents(): Promise<EventRecord[]> {
	const res = await fetch(
		`${CONTRAIL_URL}/xrpc/community.lexicon.calendar.event.listRecords?actor=atmosphereconf.org&sort=startsAt&order=asc&limit=200`
	);
	if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
	const data = (await res.json()) as {
		records: Array<{
			uri: string;
			record: { name: string; additionalData?: { isAtmosphereconf?: boolean; type?: string } };
		}>;
	};

	return data.records
		.filter((r) => r.record?.additionalData?.isAtmosphereconf)
		.map((r) => ({
			uri: r.uri,
			rkey: extractRkey(r.uri),
			name: r.record.name,
			type: r.record.additionalData?.type
		}));
}

function matchEvents(events: EventRecord[], vods: VodRecord[]): VodMapping[] {
	const mappings: VodMapping[] = [];
	const usedVods = new Set<string>();

	for (const event of events) {
		const eventNorm = normalize(event.name);

		// Exact match
		let match = vods.find((v) => !usedVods.has(v.uri) && normalize(v.title) === eventNorm);

		// Substring match
		if (!match && eventNorm.length >= 10) {
			match = vods.find((v) => {
				if (usedVods.has(v.uri)) return false;
				const vodNorm = normalize(v.title);
				return vodNorm.length >= 10 && (eventNorm.includes(vodNorm) || vodNorm.includes(eventNorm));
			});
		}

		if (match) {
			usedVods.add(match.uri);
			mappings.push({
				eventRkey: event.rkey,
				eventTitle: event.name,
				vodRkey: match.rkey,
				vodTitle: match.title
			});
		}
	}

	return mappings;
}

async function main() {
	console.log('Fetching VODs...');
	const vods = await fetchAllVods();
	console.log(`Found ${vods.length} VODs`);

	console.log('Fetching events...');
	const events = await fetchAllEvents();
	console.log(`Found ${events.length} atmosphere conf events`);

	const mappings = matchEvents(events, vods);
	console.log(`\nMatched ${mappings.length} of ${events.length} events to VODs`);

	// Show unmatched events
	const matchedRkeys = new Set(mappings.map((m) => m.eventRkey));
	const unmatched = events.filter((e) => !matchedRkeys.has(e.rkey));
	if (unmatched.length > 0) {
		console.log(`\nUnmatched events (${unmatched.length}):`);
		for (const e of unmatched) {
			console.log(`  [${e.type || '?'}] ${e.name}`);
		}
	}

	// Show unmatched VODs
	const matchedVodRkeys = new Set(mappings.map((m) => m.vodRkey));
	const unmatchedVods = vods.filter((v) => !matchedVodRkeys.has(v.rkey));
	if (unmatchedVods.length > 0) {
		console.log(`\nUnmatched VODs (${unmatchedVods.length}):`);
		for (const v of unmatchedVods) {
			console.log(`  - ${v.title}`);
		}
	}

	// Write the mapping
	const outPath = new URL('../src/lib/vod-map.json', import.meta.url);
	const output = mappings.map(({ eventRkey, vodRkey, eventTitle, vodTitle }) => ({
		eventRkey,
		vodRkey,
		eventTitle,
		vodTitle
	}));
	const { writeFileSync } = await import('fs');
	const { fileURLToPath } = await import('url');
	writeFileSync(fileURLToPath(outPath), JSON.stringify(output, null, '\t') + '\n');
	console.log(`\nWrote ${mappings.length} mappings to src/lib/vod-map.json`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
