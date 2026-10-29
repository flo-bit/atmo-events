<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { login } from '@svelte-atproto/oauth/client';
	import {
		requiredScopes,
		moderationActionScope,
		blueskyPostingScope
	} from '#lib/atproto/settings.js';
	import {
		loadReports,
		resolveReport,
		hideSubject,
		undoAction
	} from '#lib/moderation/reports.remote.js';
	import type { ModerationReport } from '@atmo-dev/contrail/moderation';
	type InboxReport = ModerationReport & { actionPending?: boolean };
	let { data } = $props();
	let reports = $state<InboxReport[]>(untrack(() => data.reports));
	let cursor = $state<string | undefined>(untrack(() => data.cursor));
	let notes = $state<Record<number, string>>({});
	let pending = $state(false);
	let message = $state('');
	$effect(() => {
		reports = data.reports as InboxReport[];
		cursor = data.cursor;
	});
	function subject(report: ModerationReport) {
		return report.subject.$type === 'com.atproto.admin.defs#repoRef'
			? report.subject.did
			: report.subject.uri;
	}
	async function run(operation: () => Promise<void>) {
		if (pending) return;
		pending = true;
		message = '';
		try {
			await operation();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Operation failed. Try again.';
		} finally {
			pending = false;
		}
	}
	async function hide(report: ModerationReport) {
		if (
			!confirm('Publish a public hide action for this subject? Report details will stay private.')
		)
			return;
		await run(async () => {
			const result = await hideSubject({ id: report.id });
			reports = reports.map((r) =>
				r.id === report.id ? { ...r, actionUri: result.uri, actionPending: false } : r
			);
			message = result.synced
				? 'Subject hidden. Resolve the report when ready.'
				: 'Action published. Local indexing is pending; do not publish a duplicate.';
		});
	}
	async function finish(report: ModerationReport) {
		await run(async () => {
			await resolveReport({
				id: report.id,
				resolution: notes[report.id]
			});
			reports = reports.filter((r) => r.id !== report.id);
		});
	}
	async function undo(report: ModerationReport) {
		if (
			!report.actionUri ||
			!confirm('Delete your public moderation action? Other hide reasons may still apply.')
		)
			return;
		await run(async () => {
			const result = await undoAction({ uri: report.actionUri! });
			reports = reports.map((r) =>
				r.id === report.id ? { ...r, actionUri: null, actionPending: false } : r
			);
			message = result.synced
				? 'Action removed.'
				: 'Action removed from your repository; local indexing is pending.';
		});
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<div class="mb-6 flex items-center justify-between gap-4">
		<h1 class="text-2xl font-semibold">Reports</h1>
		<nav aria-label="Report status" class="flex gap-4 text-sm">
			<a href={resolve('/(app)/mod')} aria-current={data.status === 'open' ? 'page' : undefined}
				>Open</a
			>
			<a
				href={`${resolve('/(app)/mod')}?status=resolved`}
				aria-current={data.status === 'resolved' ? 'page' : undefined}>Resolved</a
			>
		</nav>
	</div>
	{#if !data.canPublishActions}
		<Button
			variant="secondary"
			onclick={() =>
				login(data.did!, {
					scope: [
						...requiredScopes,
						moderationActionScope,
						...(data.canPostToBluesky ? [blueskyPostingScope] : [])
					],
					saveReturnTo: true
				})}>Authorize moderation actions</Button
		>
	{/if}
	{#if message}<p role="status" class="my-4 text-sm">{message}</p>{/if}
	{#if !reports.length}<p class="text-muted py-8">No {data.status} reports.</p>{/if}
	{#each reports as report (report.id)}
		<article class="border-line space-y-3 border-b py-6">
			<p class="text-sm break-all">{subject(report)}</p>
			<p class="text-muted text-xs">
				{report.reasonType.split('#').pop()} · {new Date(report.createdAt).toLocaleString()}
			</p>
			{#if report.reason}<p class="whitespace-pre-wrap">{report.reason}</p>{/if}
			<p class="text-muted text-xs break-all">Reported by {report.reportedBy}</p>
			{#if report.preview?.hidden}<p class="text-sm">Currently hidden</p>{/if}
			{#if report.preview}
				<details class="text-sm">
					<summary class="cursor-pointer">Indexed content and labels</summary>
					<pre class="mt-2 max-h-96 overflow-auto break-all whitespace-pre-wrap">{JSON.stringify(
							{ records: report.preview.records, labels: report.preview.labels },
							null,
							2
						)}</pre>
				</details>
			{/if}
			{#if data.status === 'open'}
				<label for={`note-${report.id}`} class="block text-sm">Private resolution note</label>
				<textarea
					id={`note-${report.id}`}
					bind:value={notes[report.id]}
					maxlength="4000"
					rows="2"
					class="border-line bg-surface w-full rounded-md border p-2"></textarea>
				<div class="flex flex-wrap gap-2">
					{#if data.canPublishActions && ((!report.actionUri && !report.preview?.hidden) || (report.actionPending && report.actionUri?.startsWith(`at://${data.did}/`)))}
						<Button variant="secondary" disabled={pending} onclick={() => hide(report)}
							>{report.actionPending ? 'Retry hide' : 'Hide subject'}</Button
						>
					{/if}
					<Button disabled={pending} onclick={() => finish(report)}>Resolve</Button>
				</div>
			{:else}
				{#if report.resolution}<p class="text-sm whitespace-pre-wrap">{report.resolution}</p>{/if}
			{/if}
			{#if report.actionUri?.startsWith(`at://${data.did}/`) && data.canPublishActions}
				<Button variant="secondary" disabled={pending} onclick={() => undo(report)}
					>Undo my action</Button
				>
			{/if}
		</article>
	{/each}
	{#if cursor}
		<Button
			class="mt-6"
			disabled={pending}
			onclick={() =>
				run(async () => {
					const next = await loadReports({ status: data.status, cursor });
					const seen = new Set(reports.map((r) => r.id));
					reports = [...reports, ...next.reports.filter((r) => !seen.has(r.id))] as InboxReport[];
					cursor = next.cursor;
				})}>Load more</Button
		>
	{/if}
</div>
