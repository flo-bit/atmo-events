<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import EventView from '$lib/components/EventView.svelte';
	import { redeemInvite } from '$lib/spaces/server/spaces.remote';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));

	let inviteBusy = $state(false);
	let inviteError: string | null = $state(null);

	onMount(async () => {
		const token = page.url.searchParams.get('invite');
		if (!token) return;
		if (data.authState === 'anon') return;
		// Anonymous viewer who got in via the read-token bearer path — no
		// redemption to do (they're not logged in, the link is just for reading).
		if ('viaInviteToken' in data && data.viaInviteToken) return;

		inviteBusy = true;
		try {
			await redeemInvite({ token });
			const u = new URL(page.url);
			u.searchParams.delete('invite');
			await goto(u.pathname + u.search, { replaceState: true, invalidateAll: true });
		} catch (e) {
			inviteError = e instanceof Error ? e.message : String(e);
			await invalidateAll();
		} finally {
			inviteBusy = false;
		}
	});
</script>

{#if data.authState === 'anon'}
	<div class="mx-auto max-w-md px-4 pt-16 text-center">
		<h1 class="mb-2 text-xl font-semibold">Login to see event</h1>
		<p class="text-base-500 mb-4 text-sm">
			This is a private event. Sign in with atproto to view.
		</p>
		<button
			class="bg-base-900 dark:bg-base-50 dark:text-base-900 rounded-md px-4 py-2 text-sm font-medium text-white"
			onclick={() => atProtoLoginModalState.show()}
		>
			Sign in
		</button>
	</div>
{:else if data.authState === 'pending-invite'}
	<div class="mx-auto max-w-md px-4 pt-16 text-center">
		<p class="text-base-500 text-sm">Redeeming invite…</p>
		{#if inviteError}
			<p class="mt-3 text-xs text-red-600">{inviteError}</p>
		{/if}
	</div>
{:else if data.authState === 'no-access' || data.authState === 'not-found'}
	<div class="mx-auto max-w-md px-4 pt-16 text-center">
		<h1 class="mb-2 text-xl font-semibold">Event not found</h1>
		<p class="text-base-500 text-sm">
			This event doesn't exist, or you don't have permission to view it.
		</p>
		{#if inviteError}
			<p class="text-base-500 mt-3 text-xs">Invite redemption failed: {inviteError}</p>
		{/if}
	</div>
{:else}
	{#if inviteBusy}
		<div class="mx-auto max-w-md px-4 pt-4 text-center">
			<p class="text-base-500 text-sm">Redeeming invite…</p>
		</div>
	{/if}
	<EventView {data} {adapter} {viewer} />
	{#if data.isOwner}
		<div class="mx-auto max-w-3xl px-4 pb-12">
			<a
				href="/p/{data.hostProfile?.handle || data.ownerDid}/e/{data.rkey}/s/{data.spaceKey}/admin"
				class="text-base-500 text-sm underline">Manage members & invites →</a
			>
		</div>
	{/if}
{/if}
