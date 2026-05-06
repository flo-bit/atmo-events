<script lang="ts">
	import { Button, Checkbox, Input, Label, Modal } from '@foxui/core';
	import DateTimePicker from '../DateTimePicker.svelte';
	import ShareModal from '../ShareModal.svelte';
	import { datetimeLocalToISO } from '../date-format.js';
	import type { HostProfile } from '../contrail.js';
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';

	let {
		spaceUri,
		spaceKey,
		did,
		rkey,
		eventName,
		hostProfile,
		adapter,
		viewer
	}: {
		spaceUri: string;
		spaceKey: string;
		did: string;
		rkey: string;
		eventName: string;
		hostProfile: HostProfile | null | undefined;
		adapter: EditorAdapter;
		viewer: EditorViewer;
	} = $props();

	let inviteUrl: string | null = $state(null);
	let inviteBusy = $state(false);
	let inviteError: string | null = $state(null);
	let showInviteModal = $state(false);

	// Invite-options dialog (shown before the share modal) — owner picks
	// whether to allow anonymous reads, max uses, and expiry.
	let showInviteForm = $state(false);
	let inviteAllowAnonRead = $state(true);
	let inviteMaxUsesText = $state('');
	let inviteHasExpiry = $state(false);
	let inviteExpiresAt = $state('');
	const inviteTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	function openInviteForm() {
		inviteError = null;
		inviteAllowAnonRead = true;
		inviteMaxUsesText = '';
		inviteHasExpiry = false;
		showInviteForm = true;
	}

	async function submitInviteForm() {
		if (inviteBusy) return;
		inviteBusy = true;
		inviteError = null;
		try {
			let maxUses: number | undefined;
			if (inviteMaxUsesText.trim()) {
				const n = Number(inviteMaxUsesText);
				if (!Number.isInteger(n) || n < 1) {
					throw new Error('Max uses must be a positive integer.');
				}
				maxUses = n;
			}

			let expiresAt: number | undefined;
			if (inviteHasExpiry && inviteExpiresAt.trim()) {
				const iso = datetimeLocalToISO(inviteExpiresAt, inviteTimezone);
				const ts = new Date(iso).getTime();
				if (!Number.isFinite(ts)) throw new Error('Invalid expiry date.');
				if (ts <= Date.now()) throw new Error('Expiry must be in the future.');
				expiresAt = ts;
			}

			if (!adapter.createSpaceInvite) {
				throw new Error('createSpaceInvite not supported by this adapter');
			}
			const result = await adapter.createSpaceInvite({
				spaceUri,
				kind: inviteAllowAnonRead ? 'read-join' : 'join',
				...(maxUses != null ? { maxUses } : {}),
				...(expiresAt != null ? { expiresAt } : {})
			});
			inviteUrl = `${window.location.origin}/p/${hostProfile?.handle || did}/e/${rkey}/s/${spaceKey}?invite=${result.token}`;
			showInviteForm = false;
			showInviteModal = true;
		} catch (e) {
			inviteError = e instanceof Error ? e.message : String(e);
		} finally {
			inviteBusy = false;
		}
	}
</script>

<Button variant="secondary" class="mt-3 w-full" onclick={openInviteForm}>
	Share invite link
</Button>

<Modal bind:open={showInviteForm} interactOutsideBehavior={inviteBusy ? 'ignore' : 'close'}>
	<h2 class="mb-4 text-lg font-semibold">Create invite link</h2>

	<form
		class="space-y-4"
		onsubmit={(e) => {
			e.preventDefault();
			submitInviteForm();
		}}
	>
		<div class="flex items-start gap-2">
			<Checkbox id="invite-allow-anon" bind:checked={inviteAllowAnonRead} disabled={inviteBusy} />
			<div>
				<Label for="invite-allow-anon">Allow viewing event without being logged in</Label>
				<p class="text-base-500 dark:text-base-400 mt-0.5 text-xs">
					Anyone with this link can read the event details. Signed-in users can still join with the
					same link.
				</p>
			</div>
		</div>

		<div>
			<Label for="invite-max-uses">Max uses</Label>
			<Input
				id="invite-max-uses"
				type="number"
				min="1"
				bind:value={inviteMaxUsesText}
				placeholder="Unlimited"
				disabled={inviteBusy}
			/>
			<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
				Caps how many people can join — anonymous reads are always unlimited. Leave empty for no
				limit.
			</p>
		</div>

		<div>
			<div class="mb-1 flex items-center gap-2">
				<Checkbox id="invite-has-expiry" bind:checked={inviteHasExpiry} disabled={inviteBusy} />
				<Label for="invite-has-expiry">Set an expiry</Label>
			</div>
			{#if inviteHasExpiry}
				<DateTimePicker bind:value={inviteExpiresAt} />
			{:else}
				<p class="text-base-500 dark:text-base-400 text-xs">Link never expires.</p>
			{/if}
		</div>

		{#if inviteError}
			<p class="text-sm text-red-600 dark:text-red-400">{inviteError}</p>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<Button
				type="button"
				variant="secondary"
				onclick={() => (showInviteForm = false)}
				disabled={inviteBusy}
			>
				Cancel
			</Button>
			<Button type="submit" disabled={inviteBusy}>
				{inviteBusy ? 'Creating…' : 'Create invite'}
			</Button>
		</div>
	</form>
</Modal>

{#if inviteUrl}
	<ShareModal
		bind:open={showInviteModal}
		url={inviteUrl}
		title="Invite link"
		shareText={`You're invited to "${eventName}".\n\n${inviteUrl}`}
		{eventName}
		{adapter}
		{viewer}
	/>
{/if}
