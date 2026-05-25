<script lang="ts">
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { user } from '$lib/atproto/auth.svelte';
	import { Head, Navbar, Button, Avatar } from '@foxui/core';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { dev } from '$app/environment';
	import { ModeWatcher } from 'mode-watcher';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import CreateEventModal, { createEventModalState } from '$lib/components/CreateEventModal.svelte';

	let { children } = $props();
</script>

<ModeWatcher />

<Navbar class="top-2 right-2 left-2 mx-auto max-w-3xl rounded-full! pr-3 pl-6">
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
				<Button onclick={() => createEventModalState.show()} class="hidden sm:inline-flex">
					Create Event
				</Button>
				<Button onclick={() => createEventModalState.show()} size="icon" class="sm:hidden">
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
			{/if}
			<!-- Settings entry point is dev-only for now: deploy without surfacing
			     notifications to users yet. The /settings route still exists. -->
			{#if dev}
				<a
					href="/settings"
					aria-label="Settings"
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
							d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.241.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
						/>
					</svg>
				</a>
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
<CreateEventModal />

<Head
	title="atmo.rsvp"
	description="discover and attend events"
	image={page.data?.ogImage ?? '/og.png'}
/>
