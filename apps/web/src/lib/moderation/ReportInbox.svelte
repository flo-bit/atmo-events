<script lang="ts">
	import { Button, Icon } from '@atmo-dev/kit';
	import { EyeOff } from '@sketchyicons/svelte';
	import { untrack } from 'svelte';
	import ReportRow from './ReportRow.svelte';
	import {
		moderationErrorMessage,
		type InboxActions,
		type InboxData,
		type InboxReport
	} from './inbox';

	let {
		data,
		actions,
		basePath = '/mod'
	}: { data: InboxData; actions: InboxActions; basePath?: string } = $props();
	let reports = $state(untrack(() => data.reports));
	let cursor = $state(untrack(() => data.cursor));
	let openCount = $state(untrack(() => data.openCount));
	let loading = $state(false);
	let failure = $state('');
	let notice = $state('');
	$effect(() => {
		reports = data.reports;
		cursor = data.cursor;
		openCount = data.openCount;
		loading = false;
		failure = '';
		notice = '';
	});
	function update(id: number, patch: Partial<InboxReport>) {
		reports = reports.map((report) => (report.id === id ? { ...report, ...patch } : report));
	}
	function resolved(id: number) {
		reports = reports.filter((report) => report.id !== id);
		openCount = Math.max(0, openCount - 1);
		notice = 'Report resolved.';
	}
	async function more() {
		if (loading || !cursor) return;
		const current = data;
		loading = true;
		failure = '';
		try {
			const next = await actions.load({ status: data.status, cursor });
			if (data !== current) return;
			const seen = new Set(reports.map((report) => report.id));
			reports = [...reports, ...next.reports.filter((report) => !seen.has(report.id))];
			cursor = next.cursor;
		} catch (cause) {
			if (data === current) failure = moderationErrorMessage(cause);
		} finally {
			if (data === current) loading = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 pt-8 pb-12 sm:pt-10">
	<header class="border-line flex flex-wrap items-center justify-between gap-4 border-b pb-5">
		<h1 class="text-ink text-2xl font-medium tracking-tight">Reports</h1>
		<nav aria-label="Report status" class="flex gap-1 text-sm">
			<a
				href={basePath}
				aria-label={`Open reports (${openCount})`}
				aria-current={data.status === 'open' ? 'page' : undefined}
				class={[
					'inline-flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
					data.status === 'open' ? 'bg-recess text-ink font-medium' : 'text-muted hover:text-ink'
				]}
				>Open <span
					class="border-line text-muted rounded-md border px-1.5 py-0.5 text-xs tabular-nums"
					aria-hidden="true">{openCount}</span
				></a
			>
			<a
				href={`${basePath}?status=resolved`}
				aria-current={data.status === 'resolved' ? 'page' : undefined}
				class={[
					'rounded-lg px-3 py-2 transition-colors',
					data.status === 'resolved'
						? 'bg-recess text-ink font-medium'
						: 'text-muted hover:text-ink'
				]}>Resolved</a
			>
		</nav>
	</header>

	{#if !data.canPublishActions}
		<div class="border-line mt-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
			<Icon img={EyeOff} size={19} class="text-muted shrink-0" />
			<p class="text-muted min-w-40 flex-1 text-xs leading-relaxed">
				To hide content, allow public moderation actions from your account. Reviewing and resolving
				reports needs no extra permission.
			</p>
			<Button variant="secondary" size="sm" onclick={actions.authorize}>Enable hiding</Button>
		</div>
	{/if}

	{#if notice}<p role="status" class="text-muted mt-5 text-sm">{notice}</p>{/if}
	<div class="mt-5 grid gap-3">
		{#key data.status}
			{#each reports as report (report.id)}
				<ReportRow
					{report}
					viewerDid={data.did}
					canPublishActions={data.canPublishActions}
					{actions}
					onUpdate={update}
					onResolved={resolved}
				/>
			{:else}
				<p class="text-muted py-16 text-center text-sm">No {data.status} reports.</p>
			{/each}
		{/key}
	</div>
	{#if failure}<p role="alert" class="text-ink mt-5 text-sm">{failure}</p>{/if}
	{#if cursor}<div class="mt-6">
			<Button variant="secondary" {loading} onclick={more}
				>{loading ? 'Loading…' : 'Load more reports'}</Button
			>
		</div>{/if}
</div>
