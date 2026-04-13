<script lang="ts">
	import { Button } from '@foxui/core';

	let { data } = $props();

	function statusLabel(status: string): string {
		if (status === 'collecting') return 'Collecting availability';
		if (status === 'polling') return 'Voting';
		if (status === 'resolved') return 'Event created';
		return status;
	}

	function statusColor(status: string): string {
		if (status === 'collecting') return 'text-yellow-500';
		if (status === 'polling') return 'text-accent-400';
		if (status === 'resolved') return 'text-green-500';
		return 'text-base-500';
	}
</script>

<svelte:head>
	<title>Find a Time</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Find a Time</h1>
		<Button href="/schedule/new">New</Button>
	</div>

	{#if data.requests.length === 0}
		<div class="text-base-500 dark:text-base-400 py-12 text-center">
			<p class="mb-4">Nothing here yet.</p>
			<Button href="/schedule/new">Find a Time</Button>
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.requests as req (req.id)}
				<a
					href="/schedule/{req.id}"
					class="border-base-200 dark:border-base-800 hover:border-base-400 dark:hover:border-base-600 block rounded-lg border p-4 transition-colors"
				>
					<div class="flex items-center justify-between">
						<h2 class="text-base-900 dark:text-base-50 font-medium">{req.title}</h2>
						<span class="text-xs font-medium {statusColor(req.status)}">
							{statusLabel(req.status)}
						</span>
					</div>
					<div class="text-base-500 dark:text-base-400 mt-1 flex gap-3 text-xs">
						<span>{req.date_start} – {req.date_end}</span>
						<span>{data.counts[req.id] ?? 0} response{(data.counts[req.id] ?? 0) === 1 ? '' : 's'}</span>
						{#if req.organizer_did === data.myDid}
							<span class="text-accent-500">organizer</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
