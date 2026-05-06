<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		addMember,
		removeMember,
		createInvite,
		revokeInvite
	} from '$lib/spaces/server/spaces.remote';

	let { data } = $props();

	let tab: 'members' | 'invites' = $state('members');

	let newMemberDid = $state('');
	let newMemberPerms: 'read' | 'write' = $state('write');
	let memberErr: string | null = $state(null);
	let memberBusy = $state(false);

	let inviteExpiryDays = $state(7);
	let inviteMaxUses = $state<number | ''>('');
	let inviteNote = $state('');
	let inviteBusy = $state(false);
	let lastInviteToken: string | null = $state(null);

	async function handleAddMember(e: Event) {
		e.preventDefault();
		memberErr = null;
		memberBusy = true;
		try {
			await addMember({
				spaceUri: data.spaceUri,
				did: newMemberDid.trim(),
				perms: newMemberPerms || undefined
			});
			newMemberDid = '';
			await invalidateAll();
		} catch (err) {
			memberErr = (err as Error).message || 'Failed to add';
		} finally {
			memberBusy = false;
		}
	}

	async function handleRemoveMember(did: string) {
		if (!confirm(`Remove ${did}?`)) return;
		await removeMember({ spaceUri: data.spaceUri, did });
		await invalidateAll();
	}

	async function handleCreateInvite(e: Event) {
		e.preventDefault();
		inviteBusy = true;
		try {
			const result = await createInvite({
				spaceUri: data.spaceUri,
				expiresAt:
					inviteExpiryDays > 0 ? Date.now() + inviteExpiryDays * 24 * 3600 * 1000 : undefined,
				maxUses: typeof inviteMaxUses === 'number' ? inviteMaxUses : undefined,
				note: inviteNote || undefined
			});
			lastInviteToken = result.token;
			inviteNote = '';
			await invalidateAll();
		} finally {
			inviteBusy = false;
		}
	}

	async function handleRevoke(tokenHash: string) {
		if (!confirm('Revoke this invite?')) return;
		await revokeInvite({ spaceUri: data.spaceUri, tokenHash });
		await invalidateAll();
	}

	function inviteUrl(token: string) {
		const origin = typeof location !== 'undefined' ? location.origin : '';
		return `${origin}/p/${data.actor}/e/${data.rkey}/s/${data.spaceKey}?invite=${token}`;
	}
</script>

<svelte:head>
	<title>Manage private event</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-6 pb-12">
	<div class="mb-4">
		<a
			href="/p/{data.actor}/e/{data.rkey}/s/{data.spaceKey}"
			class="text-base-500 text-sm">← back to event</a
		>
	</div>

	<h1 class="mb-4 text-2xl font-semibold">Manage private event</h1>

	<nav class="mb-4 flex gap-4 border-b border-base-200 dark:border-base-800">
		{#each ['members', 'invites'] as t (t)}
			<button
				class:border-b-2={tab === t}
				class:border-base-900={tab === t}
				class:dark:border-base-50={tab === t}
				class="-mb-px pb-2 text-sm capitalize"
				onclick={() => (tab = t as typeof tab)}
			>
				{t}
				{#if t === 'members'}<span class="text-base-500 ml-1">({data.members.length})</span>{/if}
				{#if t === 'invites'}<span class="text-base-500 ml-1">({data.invites.length})</span>{/if}
			</button>
		{/each}
	</nav>

	{#if tab === 'members'}
		<form onsubmit={handleAddMember} class="mb-6 flex flex-wrap gap-2">
			<input
				bind:value={newMemberDid}
				placeholder="did:plc:..."
				class="border-base-300 dark:border-base-700 dark:bg-base-900 flex-1 rounded-md border px-2 py-1.5 text-sm"
			/>
			<select
				bind:value={newMemberPerms}
				class="border-base-300 dark:border-base-700 dark:bg-base-900 w-28 rounded-md border px-2 py-1.5 text-sm"
			>
				<option value="write">write</option>
				<option value="read">read</option>
			</select>
			<button
				type="submit"
				disabled={memberBusy}
				class="bg-base-900 dark:bg-base-50 dark:text-base-900 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
				>Add</button
			>
		</form>
		{#if memberErr}
			<p class="mb-3 text-sm text-red-600">{memberErr}</p>
		{/if}
		<ul class="divide-base-200 dark:divide-base-800 divide-y">
			{#each data.members as m (m.did)}
				<li class="flex items-center justify-between py-2">
					<div>
						<div class="font-mono text-xs">{m.did}</div>
					</div>
					<button class="text-xs text-red-600" onclick={() => handleRemoveMember(m.did)}
						>Remove</button
					>
				</li>
			{/each}
		</ul>
	{:else}
		<form onsubmit={handleCreateInvite} class="mb-6 space-y-2">
			<div class="flex gap-2">
				<label class="text-sm">
					Expires in
					<input
						type="number"
						min="0"
						bind:value={inviteExpiryDays}
						class="border-base-300 dark:border-base-700 dark:bg-base-900 ml-1 w-16 rounded-md border px-2 py-1 text-sm"
					/>
					days (0 = never)
				</label>
				<label class="text-sm">
					Max uses
					<input
						type="number"
						min="1"
						bind:value={inviteMaxUses}
						placeholder="∞"
						class="border-base-300 dark:border-base-700 dark:bg-base-900 ml-1 w-16 rounded-md border px-2 py-1 text-sm"
					/>
				</label>
			</div>
			<input
				bind:value={inviteNote}
				placeholder="Note (optional)"
				class="border-base-300 dark:border-base-700 dark:bg-base-900 w-full rounded-md border px-2 py-1.5 text-sm"
			/>
			<button
				type="submit"
				disabled={inviteBusy}
				class="bg-base-900 dark:bg-base-50 dark:text-base-900 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
				>Create invite</button
			>
		</form>

		{#if lastInviteToken}
			<div
				class="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
			>
				<div class="mb-1 font-medium">Invite URL — copy now, not shown again:</div>
				<code class="dark:bg-base-900 block rounded bg-white p-2 font-mono text-xs break-all"
					>{inviteUrl(lastInviteToken)}</code
				>
			</div>
		{/if}

		<ul class="divide-base-200 dark:divide-base-800 divide-y">
			{#each data.invites as inv (inv.tokenHash)}
				<li class="flex items-start justify-between py-2 text-sm">
					<div>
						<div class="font-medium">{inv.note || '(no note)'}</div>
						<div class="text-base-500 text-xs">
							uses {inv.usedCount}{inv.maxUses ? `/${inv.maxUses}` : ''}
							{#if inv.expiresAt}• expires {new Date(inv.expiresAt).toLocaleDateString()}{/if}
							{#if inv.revokedAt}• <span class="text-red-600">revoked</span>{/if}
						</div>
					</div>
					{#if !inv.revokedAt}
						<button class="text-xs text-red-600" onclick={() => handleRevoke(inv.tokenHash)}
							>Revoke</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
