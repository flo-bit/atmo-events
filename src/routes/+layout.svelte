<script lang="ts">
	import '../app.css';
	import { AtprotoLoginModal, atProtoLoginModalState } from '@foxui/social';
	import { login, signup } from '$lib/atproto';
	import { user } from '$lib/atproto/auth.svelte';
	import { Head, Navbar, Button, Avatar } from '@foxui/core';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<Navbar class="right-2 left-2 mx-auto max-w-3xl rounded-full pl-6 pr-3 top-2">
	<div class="flex items-center gap-6">
		<a href={resolve("/")} class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 text-sm font-medium transition-colors">events</a>
		<a href="/calendar" class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 text-sm font-medium transition-colors">calendar</a>
	</div>
	<div class="flex items-center gap-4">
		{#if user.isLoggedIn}
			<Button href="/create">Create Event</Button>
			<a href="/p/{user.profile?.handle || user.did}" class="shrink-0">
				<Avatar
					src={user.profile?.avatar}
					alt=""
					fallback={(user.profile?.handle || user.did || '?').charAt(0).toUpperCase()}
					class="size-10 rounded-full object-cover"
				/>
			</a>
		{:else}
			<Button onclick={() => atProtoLoginModalState.show()} variant="ghost">Create Event</Button>
			<Button onclick={() => atProtoLoginModalState.show()}>Login</Button>
		{/if}
	</div>
</Navbar>

<div class="pt-14">
	{@render children()}
</div>

<AtprotoLoginModal
	login={async (handle) => {
		await login(handle);
		return true;
	}}
	signup={async () => {
		signup();
		return true;
	}}
/>

<Head
	title="atmo.rsvp"
	emojiFavicon="🗓️"
	description="discover and attend events"
	image="/og.png"
/>
