// CLI entry for the D1 -> Meili event reindex. Resolves the D1 binding exactly
// like `contrail backfill`, so `:remote` needs the same wrangler `env.production`
// that `backfill:remote` already relies on:
//   pnpm meili:reindex            # default env -> local D1 binding
//   pnpm meili:reindex:remote     # --remote -> getPlatformProxy production env
//
// The Meili backend is resolved from the same env the sink uses, injected by the
// operator (so no secret is committed):
//   SEARCH_SINK_URL / SEARCH_SINK_API_KEY / SEARCH_INDEX
// Reads records_event (SELECT only) and feeds the sink. Zero D1 writes.
import { getPlatformProxy } from 'wrangler';
import { applyMeiliSettings, createMeiliSink, meiliSinkBackendFromEnv } from './meili-sink';
import { reindexEventsToSink, type ReindexDb } from './reindex';

const remote = process.argv.includes('--remote');
const binding = 'DB';

// Resolve the backend ourselves rather than borrowing config.sinks[0]: that
// path is gated only on SEARCH_SINK_URL, so a missing/invalid SEARCH_SINK_API_KEY
// leaves the sink a silent no-op while we'd still report "N rows reindexed".
// Here a half-configured env fails loudly before we touch D1.
const backend = meiliSinkBackendFromEnv(process.env);
if (!backend) {
	console.error(
		'No search sink configured. Export SEARCH_SINK_URL and SEARCH_SINK_API_KEY (and optionally SEARCH_INDEX) before running.'
	);
	process.exit(1);
}

// Apply index settings up front. It's idempotent, ensures the read path's
// filters (_geo / startsAt / endsAt) resolve even on a never-armed index, and
// doubles as an auth/connectivity check: a bad admin key or unreachable Meili
// throws here instead of letting every per-batch upsert silently fail.
await applyMeiliSettings(backend);
const sink = createMeiliSink(() => backend);

// Say which D1 we're about to touch, so an operator can't mistake a default-env
// (local) run for a deployed one, or vice-versa.
console.log(
	`reindex target: ${remote ? 'production env (deployed D1)' : 'default env (local D1)'}`
);
const { env, dispose } = await getPlatformProxy({
	environment: remote ? 'production' : undefined
});
try {
	const db = (env as Record<string, unknown>)[binding] as ReindexDb | undefined;
	if (!db)
		throw new Error(
			`No "${binding}" binding in wrangler env (${remote ? 'production' : 'default'}).`
		);

	const total = await reindexEventsToSink({
		db,
		sink,
		onProgress: (n) => console.log(`fed ${n} event rows -> Meili sink`)
	});
	console.log(`done: ${total} event rows reindexed to Meili (zero D1 writes)`);
} finally {
	await dispose();
}
