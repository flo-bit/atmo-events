<script lang="ts">
	import { Avatar, Badge, Button, Icon, Modal, Textarea } from '@atmo-dev/kit';
	import { CalendarDays, Check, EyeOff, ExternalLink, RotateCcw } from '@sketchyicons/svelte';
	import { onDestroy } from 'svelte';
	import {
		fallbackProfile,
		moderationErrorMessage,
		reportReason,
		reportSubject,
		type InboxActions,
		type InboxReport
	} from './inbox';

	let {
		report,
		viewerDid,
		canPublishActions,
		actions,
		onUpdate,
		onResolved
	}: {
		report: InboxReport;
		viewerDid: string | null;
		canPublishActions: boolean;
		actions: InboxActions;
		onUpdate: (id: number, update: Partial<InboxReport>) => void;
		onResolved: (id: number) => void;
	} = $props();

	let subject = $derived(reportSubject(report));
	let reporter = $derived(report.reporter ?? fallbackProfile(report.reportedBy));
	let ownAction = $derived(!!viewerDid && !!report.actionUri?.startsWith(`at://${viewerDid}/`));
	let canHide = $derived(
		report.status === 'open' &&
			canPublishActions &&
			((!report.actionUri && !report.preview?.hidden) || (report.actionPending && ownAction))
	);
	let note = $state('');
	let pending = $state<'resolve' | 'hide' | 'undo' | null>(null);
	let failure = $state('');
	let feedback = $state('');
	let dialogOpen = $state(false);
	let confirmation = $state<'hide' | 'undo'>('hide');
	let alive = true;
	onDestroy(() => {
		alive = false;
	});

	function date(value: string | undefined) {
		if (!value || Number.isNaN(Date.parse(value))) return '';
		return new Date(value).toLocaleDateString('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}
	function confirm(action: 'hide' | 'undo') {
		confirmation = action;
		failure = '';
		dialogOpen = true;
	}
	async function resolve() {
		if (pending) return;
		pending = 'resolve';
		failure = '';
		try {
			await actions.resolve({ id: report.id, resolution: note.trim() || undefined });
			if (alive) onResolved(report.id);
		} catch (cause) {
			if (alive) failure = moderationErrorMessage(cause);
		} finally {
			if (alive) pending = null;
		}
	}
	async function publish() {
		if (pending || !canPublishActions) return;
		if (confirmation === 'hide' && !canHide) return;
		if (confirmation === 'undo' && (!ownAction || !report.actionUri)) return;
		pending = confirmation;
		failure = '';
		try {
			if (confirmation === 'hide') {
				const result = await actions.hide({ id: report.id });
				if (!alive) return;
				onUpdate(report.id, {
					actionUri: result.uri,
					actionPending: false,
					...(result.synced
						? { preview: { records: [], labels: {}, ...report.preview, hidden: true } }
						: {})
				});
				feedback = result.synced
					? 'Hidden. Resolve the report when your review is complete.'
					: 'Hide published. Visibility is still syncing; don’t publish another action.';
			} else {
				const result = await actions.undo({ uri: report.actionUri! });
				if (!alive) return;
				onUpdate(report.id, { actionUri: null, actionPending: false });
				feedback = result.synced
					? 'Your hide was removed. Other moderation actions may still apply.'
					: 'Your hide was removed. Visibility is still syncing.';
			}
			dialogOpen = false;
			// Reload authoritative visibility (another moderator may also have hidden it).
			try {
				await actions.refresh();
			} catch {
				/* The public write already succeeded. */
			}
		} catch (cause) {
			if (alive) failure = moderationErrorMessage(cause);
		} finally {
			if (alive) pending = null;
		}
	}
</script>

<article
	aria-labelledby={`report-${report.id}-title`}
	class="border-line bg-recess/60 rounded-xl border p-4 sm:p-5"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-2.5 text-xs">
			<Avatar name={reporter.name} src={reporter.avatar} size={30} />
			<div class="min-w-0">
				<p class="text-muted text-[.6875rem]">Reported by</p>
				<a
					href={reporter.href}
					target="_blank"
					rel="noopener noreferrer"
					class="text-ink inline-block max-w-full font-medium [overflow-wrap:anywhere] hover:underline"
				>
					{reporter.name}{#if reporter.handle && reporter.name !== `@${reporter.handle}`}<span
							class="text-muted ml-1 font-normal">@{reporter.handle}</span
						>{/if}
				</a>
			</div>
		</div>
		{#if date(report.createdAt)}<time
				datetime={report.createdAt}
				title={new Date(report.createdAt).toUTCString()}
				class="text-muted text-[.6875rem]">{date(report.createdAt)}</time
			>{/if}
	</div>

	<div class="mt-3">
		<p class="text-ink text-xs font-semibold">{reportReason(report.reasonType)}</p>
		{#if report.reason?.trim()}
			<p class="text-ink mt-1 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
				{report.reason}
			</p>
		{/if}
	</div>

	<div class="border-line mt-3 border-t pt-3">
		<div class="flex items-start gap-2.5">
			{#if subject.kind === 'account'}
				<Avatar name={subject.profile.name} src={subject.profile.avatar} size={30} />
			{:else}
				<Icon img={CalendarDays} size={18} class="text-muted mt-1 shrink-0" />
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-muted text-[.6875rem]">
					{subject.kind === 'event'
						? 'Reported event'
						: subject.kind === 'account'
							? 'Reported account'
							: 'Reported record'}
				</p>
				<h2
					id={`report-${report.id}-title`}
					class="text-ink text-sm leading-snug font-medium [overflow-wrap:anywhere]"
				>
					{#if subject.href}
						<a
							href={subject.href}
							target="_blank"
							rel="noopener noreferrer"
							class="decoration-action/50 underline-offset-4 hover:underline"
						>
							{subject.title}<Icon
								img={ExternalLink}
								size={12}
								class="text-muted ml-1 inline-block align-baseline"
							/>
						</a>
					{:else}{subject.title}{/if}
				</h2>
				<div class="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[.6875rem]">
					{#if subject.profile.handle && subject.title !== `@${subject.profile.handle}`}
						<a
							href={subject.profile.href}
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-ink hover:underline">@{subject.profile.handle}</a
						>
					{/if}
					{#if subject.kind === 'event' && date(subject.startsAt)}
						<time datetime={subject.startsAt}>{date(subject.startsAt)}</time>
					{/if}
				</div>
			</div>
			{#if report.actionPending}<Badge variant="outline" class="shrink-0">Hide pending</Badge>
			{:else if report.preview?.hidden}<Badge variant="outline" class="shrink-0"
					><Icon img={EyeOff} size={12} />Hidden</Badge
				>{/if}
		</div>
		<details class="mt-2 min-w-0 text-[.6875rem]">
			<summary class="text-muted hover:text-ink w-fit cursor-pointer">Technical details</summary>
			<pre
				class="border-line bg-page text-muted mt-2 max-h-64 overflow-auto rounded-lg border p-3 text-xs break-all whitespace-pre-wrap">{JSON.stringify(
					{
						reportId: report.id,
						subject: report.subject,
						reportedBy: report.reportedBy,
						actionUri: report.actionUri,
						...report.preview
					},
					null,
					2
				)}</pre>
		</details>
	</div>

	{#if report.status === 'open'}
		<details class="mt-3 text-xs">
			<summary class="text-muted hover:text-ink w-fit cursor-pointer">Add a private note</summary>
			<div class="mt-2">
				<label for={`note-${report.id}`} class="text-muted mb-1.5 block"
					>Private note <span class="text-[.6875rem]">(optional)</span></label
				>
				<Textarea
					id={`note-${report.id}`}
					bind:value={note}
					disabled={!!pending}
					maxlength={4000}
					rows={2}
					class="bg-page min-h-16 py-2 text-sm"
				/>
			</div>
		</details>
	{:else if report.resolution}
		<div class="mt-3">
			<p class="text-muted mb-1 text-xs">Private note</p>
			<p class="text-ink text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
				{report.resolution}
			</p>
		</div>
	{/if}

	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if report.status === 'open'}
			<Button
				size="sm"
				loading={pending === 'resolve'}
				disabled={!!pending}
				onclick={resolve}
				title="Close this report without changing content visibility"
			>
				<Icon img={Check} size={15} />{pending === 'resolve' ? 'Resolving…' : 'Resolve report'}
			</Button>
			{#if canHide}
				<Button variant="secondary" size="sm" disabled={!!pending} onclick={() => confirm('hide')}>
					<Icon img={EyeOff} size={15} />{report.actionPending
						? 'Retry hide…'
						: `Hide ${subject.kind}…`}
				</Button>
			{/if}
		{/if}
		{#if ownAction && canPublishActions}
			<Button variant="secondary" size="sm" disabled={!!pending} onclick={() => confirm('undo')}
				><Icon img={RotateCcw} size={14} />Undo hide…</Button
			>
		{/if}
	</div>
	{#if feedback}<p role="status" class="text-muted mt-2 text-xs leading-relaxed">{feedback}</p>{/if}
	{#if failure && !dialogOpen}<p role="alert" class="text-ink mt-2 text-sm">{failure}</p>{/if}
</article>

<Modal
	bind:open={dialogOpen}
	dismissible={!pending}
	title={confirmation === 'undo' ? 'Undo this hide?' : `Hide this ${subject.kind}?`}
>
	<p class="text-ink mb-3 text-sm font-medium [overflow-wrap:anywhere]">{subject.title}</p>
	{#if confirmation === 'hide'}
		<p class="text-muted text-sm leading-relaxed">
			{subject.kind === 'account'
				? 'This hides the account’s content on atmo.rsvp.'
				: 'This hides the event on atmo.rsvp.'} It publishes a public moderation action from your account.
			Other services that trust you may also hide it.
		</p>
		<p class="text-muted mt-3 text-sm leading-relaxed">
			The original content is not deleted. Report details and notes stay private. You can undo your
			action later.
		</p>
	{:else}
		<p class="text-muted text-sm leading-relaxed">
			This deletes your public moderation action. Content may remain hidden if another moderation
			action applies.
		</p>
	{/if}
	{#if failure}<p role="alert" class="text-ink mt-4 text-sm">{failure}</p>{/if}
	<div class="mt-6 flex flex-wrap justify-end gap-2">
		<Button
			variant="secondary"
			disabled={!!pending}
			data-autofocus
			onclick={() => {
				dialogOpen = false;
			}}>Cancel</Button
		>
		<Button loading={!!pending} disabled={!!pending} onclick={publish}
			>{confirmation === 'undo'
				? 'Undo hide'
				: report.actionPending
					? 'Retry hide'
					: `Hide ${subject.kind}`}</Button
		>
	</div>
</Modal>
