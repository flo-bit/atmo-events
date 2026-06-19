// CLI entry for the D1 -> Meili event reindex. Mirrors `contrail backfill`:
//   pnpm meili:reindex            # local D1 binding
//   pnpm meili:reindex:remote     # --remote -> getPlatformProxy production binding
//
// The Meili backend is resolved from the same env the sink uses, injected by the
// operator (so no secret is committed):
//   SEARCH_SINK_URL / SEARCH_SINK_API_KEY / SEARCH_INDEX
// Reads records_event (SELECT only) and feeds the config sink. Zero D1 writes.
import { getPlatformProxy } from 'wrangler';
import { config } from '../../contrail.config';
import { reindexEventsToSink, type ReindexDb } from './reindex';

const remote = process.argv.includes('--remote');
const binding = 'DB';

const sink = config.sinks?.[0];
if (!sink) {
	console.error(
		'No search sink configured. Export SEARCH_SINK_URL and SEARCH_SINK_API_KEY (and optionally SEARCH_INDEX) before running.'
	);
	process.exit(1);
}

const { env, dispose } = await getPlatformProxy({
	environment: remote ? 'production' : undefined
});
try {
	const db = (env as Record<string, unknown>)[binding] as ReindexDb | undefined;
	if (!db) throw new Error(`No "${binding}" binding in wrangler env (${remote ? 'production' : 'default'}).`);

	const total = await reindexEventsToSink({
		db,
		sink,
		onProgress: (n) => console.log(`fed ${n} event rows -> Meili sink`)
	});
	console.log(`done: ${total} event rows reindexed to Meili (zero D1 writes)`);
} finally {
	await dispose();
}
