<script lang="ts">
	import { Button, Modal } from '@atmo-dev/kit';
	import { submitReport } from './reports.remote';
	let {
		subject,
		label = 'Report'
	}: {
		subject:
			| { $type: 'com.atproto.admin.defs#repoRef'; did: string }
			| { $type: 'com.atproto.repo.strongRef'; uri: string; cid: string };
		label?: string;
	} = $props();
	let open = $state(false);
	let reasonType = $state<
		| 'com.atproto.moderation.defs#reasonSpam'
		| 'com.atproto.moderation.defs#reasonViolation'
		| 'com.atproto.moderation.defs#reasonOther'
	>('com.atproto.moderation.defs#reasonSpam');
	let reason = $state('');
	let pending = $state(false);
	let message = $state('');
	let sent = $state(false);
	const id = $props.id();
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		message = '';
		try {
			await submitReport({
				subject,
				reasonType,
				...(reason.trim() ? { reason: reason.trim() } : {})
			});
			sent = true;
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Report could not be sent. Try again.';
		} finally {
			pending = false;
		}
	}
</script>

<Button
	variant="ghost"
	onclick={() => {
		open = true;
		sent = false;
		message = '';
		reason = '';
	}}>{label}</Button
>
<Modal
	bind:open
	title="Report"
	description="Only the moderators can see your report."
	dismissible={!pending}
	class="max-w-md"
>
	{#if sent}
		<p role="status" class="mb-4">Report sent.</p>
		<Button onclick={() => (open = false)}>Done</Button>
	{:else}
		<form onsubmit={submit} class="space-y-4">
			<label for={`${id}-reason`} class="block text-sm">Reason</label>
			<select
				id={`${id}-reason`}
				bind:value={reasonType}
				class="border-line bg-surface w-full rounded-md border p-2"
			>
				<option value="com.atproto.moderation.defs#reasonSpam">Spam</option>
				<option value="com.atproto.moderation.defs#reasonViolation"
					>Harmful or illegal content</option
				>
				<option value="com.atproto.moderation.defs#reasonOther">Other</option>
			</select>
			<label for={`${id}-details`} class="block text-sm">Details (optional)</label>
			<textarea
				id={`${id}-details`}
				bind:value={reason}
				maxlength="2000"
				rows="4"
				class="border-line bg-surface w-full rounded-md border p-2"></textarea>
			{#if message}<p role="alert" class="text-sm">{message}</p>{/if}
			<Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send report'}</Button>
		</form>
	{/if}
</Modal>
