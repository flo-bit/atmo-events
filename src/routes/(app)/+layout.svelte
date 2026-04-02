<script lang="ts">
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { user } from '$lib/atproto/auth.svelte';
	import { Head, Navbar, Button, Avatar } from '@foxui/core';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import LoginModal from '$lib/components/LoginModal.svelte';

	let { children } = $props();
</script>

<ModeWatcher />

<Navbar class="top-2 right-2 left-2 mx-auto max-w-3xl rounded-full pr-3 pl-6">
	<div class="flex items-center gap-6">
		<a
			href={resolve('/')}
			class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 text-sm font-medium transition-colors"
			>events</a
		>
		<a
			href="/calendar"
			class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 text-sm font-medium transition-colors"
			>calendar</a
		>
	</div>
	<div class="flex items-center gap-4">
		<a
			href="/search"
			class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 transition-colors"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="size-5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
				/>
			</svg>
			<span class="sr-only">search for events</span>
		</a>
		{#if user.isLoggedIn}
			{#if !page.url.pathname.startsWith('/create')}
				<Button href="/create" class="hidden sm:inline-flex">Create Event</Button>
				<Button href="/create" size="icon" class="sm:hidden">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="size-5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
				</Button>
			{/if}
			<a href="/p/{user.profile?.handle || user.did}" class="shrink-0">
				<Avatar
					src={user.profile?.avatar}
					alt=""
					fallback={(user.profile?.handle || user.did || '?').charAt(0).toUpperCase()}
					class="size-10 rounded-full object-cover"
				/>
			</a>
		{:else}
			<Button
				onclick={() => atProtoLoginModalState.show()}
				variant="ghost"
				class="hidden sm:inline-flex"
			>
				Create Event</Button
			>
			<Button
				onclick={() => atProtoLoginModalState.show()}
				variant="ghost"
				size="icon"
				class="sm:hidden"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="size-5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				<span class="sr-only">create event</span>
			</Button>
			<Button onclick={() => atProtoLoginModalState.show()}>Login</Button>
		{/if}
	</div>
</Navbar>

<main class="pt-14">
	{@render children()}
</main>

<LoginModal />

<Head
	title="atmo.rsvp"
	description="discover and attend events"
	image={page.data?.ogImage ?? '/og.png'}
/>
