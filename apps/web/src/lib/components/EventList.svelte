<script lang="ts">
	import type { FlatEventRecord } from '$lib/contrail';
	import { loadMoreEvents } from '$lib/contrail/events.remote';
	import { dedupeByUri } from '$lib/dedupe-by-uri';
	import { EventCard } from '@atmo-dev/events-ui';

	let {
		events,
		cursor,
		handles = {},
		actor = undefined,
		q = undefined,
		gridClass = 'grid gap-6 sm:grid-cols-2'
	}: {
		events: FlatEventRecord[];
		cursor: string | null;
		handles?: Record<string, string>;
		actor?: string | undefined;
		// The cursor is now a fully opaque, self-describing continuation envelope:
		// load-more POSTs only { cursor }, no client-echoed pipeline/
		// filters. The single exception is the free-text search TERM, which stays
		// OUT of the envelope and rides here so the search page's load-more can
		// re-run its query; other pages leave it undefined.
		q?: string | undefined;
		gridClass?: string;
	} = $props();

	let extraEvents = $state<FlatEventRecord[]>([]);
	let currentCursor = $state<string | null>(null);
	let currentHandles = $state<Record<string, string>>({});
	let loading = $state(false);

	$effect(() => {
		currentCursor = cursor;
		extraEvents = [];
		currentHandles = { ...handles };
	});

	// Dedupe by uri so the keyed {#each} below cannot collide: a dirty source
	// (e.g. the D1 FTS path fanning one event out across duplicate fts rows) or a
	// uri overlapping between the initial page and a loadMore page would otherwise
	// repeat a key and crash hydration with each_key_duplicate.
	let allEvents = $derived(dedupeByUri([...events, ...extraEvents]));

	async function loadMore() {
		if (!currentCursor || loading) return;

		loading = true;

		try {
			// Opaque token in, opaque token out: the envelope names the server-side
			// query, so there is no client-side query reconstruction to echo. Only
			// the search term (when present) rides alongside the cursor.
			const result = await loadMoreEvents({
				cursor: currentCursor,
				...(q !== undefined ? { q } : {})
			});

			extraEvents = [...extraEvents, ...result.events];
			currentCursor = result.cursor;

			if (result.handles) {
				currentHandles = { ...currentHandles, ...result.handles };
			}
		} catch (err) {
			console.error('Failed to load more events:', err);
		} finally {
			loading = false;
		}
	}
</script>

<div class={gridClass}>
	{#each allEvents as event (event.uri)}
		<EventCard {event} actor={actor ?? currentHandles[event.did]} />
	{/each}
</div>

{#if currentCursor}
	<div class="mt-8 text-center">
		<button
			onclick={loadMore}
			disabled={loading}
			class="bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50 hover:bg-base-300 dark:hover:bg-base-700 inline-block rounded-xl px-5 py-2 text-sm font-medium transition-colors"
		>
			{loading ? 'Loading...' : 'Load more'}
		</button>
	</div>
{/if}
