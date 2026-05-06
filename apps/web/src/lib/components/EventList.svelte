<script lang="ts">
	import type { FlatEventRecord } from '$lib/contrail';
	import { loadMoreEvents } from '$lib/contrail/events.remote';
	import { EventCard } from '@atmo-dev/events-ui';

	let {
		events,
		cursor,
		handles = {},
		actor = undefined,
		fetchParams,
		gridClass = 'grid gap-6 sm:grid-cols-2'
	}: {
		events: FlatEventRecord[];
		cursor: string | null;
		handles?: Record<string, string>;
		actor?: string | undefined;
		fetchParams: Record<string, string>;
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

	let allEvents = $derived([...events, ...extraEvents]);

	async function loadMore() {
		if (!currentCursor || loading) return;

		loading = true;

		try {
			const params: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(fetchParams)) {
				if (key === 'limit' || key === 'rsvpsGoingCountMin') {
					params[key] = Number(value);
				} else if (key === 'profiles') {
					params[key] = value === 'true';
				} else {
					params[key] = value;
				}
			}
			params.cursor = currentCursor;

			const result = await loadMoreEvents(params as Parameters<typeof loadMoreEvents>[0]);

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
