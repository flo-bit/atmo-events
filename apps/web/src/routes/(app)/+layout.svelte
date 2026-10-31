<script lang="ts">
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { IconRail, IconButton, Icon, Avatar, Button } from '@atmo-dev/kit';
	import {
		House,
		Compass,
		CalendarDays,
		Hash,
		MapPin,
		Search,
		Plus,
		LogIn,
		Settings,
		Menu
	} from '@sketchyicons/svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ModeWatcher } from 'mode-watcher';
	import LoginModal from '#lib/components/LoginModal.svelte';
	import CreateEventModal, { createEventModalState } from '#lib/components/CreateEventModal.svelte';
	import AppFooter from '#lib/components/AppFooter.svelte';

	let { children } = $props();
	let navigationOpen = $state(false);

	afterNavigate(({ shallow, type }) => {
		if (shallow && type === 'goto') return;

		return (navigationOpen = false);
	});

	let path = $derived(page.url.pathname);
	// Profile and event detail routes already have their own visual header.
	let hideBrand = $derived(path.startsWith('/p/'));
	let description = $derived(
		page.data.pageDescription ?? 'Discover and attend events for the open social web.'
	);
	let ogImage = $derived(page.data.ogImage ?? `${page.url.origin}/og.png`);
	function createEvent() {
		if (user.isLoggedIn) createEventModalState.show();
		else atProtoLoginModalState.show();
	}
</script>

<ModeWatcher />
<a
	href="#app-main"
	class="rounded-ui bg-page text-action sr-only fixed top-3 left-4 z-50 p-3 focus:not-sr-only sm:left-20"
	>Skip to content</a
>
<IconRail
	id="event-navigation"
	label="Event navigation"
	mobile="drawer"
	bind:open={navigationOpen}
	items={[
		{ label: 'Home', icon: House, href: '/', active: path === '/' },
		{
			label: 'Events',
			icon: Compass,
			href: '/events',
			active: path.startsWith('/events') || /\/p\/[^/]+\/e\//.test(path)
		},

		{
			label: 'Calendar',
			icon: CalendarDays,
			href: '/calendar',
			active: path === '/calendar'
		},

		{
			label: 'Topics',
			icon: Hash,
			href: '/topics',
			active: path.startsWith('/topics')
		},

		{
			label: 'Cities',
			icon: MapPin,
			href: '/cities',
			active: path.startsWith('/cities')
		},

		{
			label: 'Search events',
			icon: Search,
			href: '/search',
			active: path === '/search'
		},

		{
			label: 'Create event',
			icon: Plus,
			onclick: createEvent,
			active: path === '/create',
			primary: true
		}
	]}
>
	{#snippet footer({ expanded, close })}
		<div class={expanded ? 'grid gap-1' : 'flex flex-col items-center gap-3'}>
			{#if user.isLoggedIn}
				<Button
					href={resolve('/(app)/settings')}
					variant="ghost"
					title="Settings"
					aria-current={path === '/settings' ? 'page' : undefined}
					onclick={close}
					class={expanded ? 'min-h-11 w-full justify-start gap-3 px-3 text-sm' : 'size-11 p-0'}
				>
					<Icon img={Settings} size={22} />
					<span class={expanded ? '' : 'sr-only'}>Settings</span>
				</Button>
				<Button
					href={resolve(`p/${user.profile?.handle || user.did || ''}`)}
					variant="ghost"
					title={user.profile?.handle ? `@${user.profile.handle}` : 'Your profile'}
					onclick={close}
					class={expanded ? 'min-h-11 w-full justify-start gap-3 px-3 text-sm' : 'size-11 p-0'}
				>
					<Avatar
						src={user.profile?.avatar}
						name={user.profile?.displayName || user.profile?.handle || user.did || 'Account'}
						size={30}
					/>
					<span class={expanded ? 'min-w-0 truncate' : 'sr-only'}>
						{user.profile?.handle ? `@${user.profile.handle}` : 'Your profile'}
					</span>
				</Button>
			{:else}
				<Button
					variant="ghost"
					title="Log in"
					onclick={() => {
						close();
						atProtoLoginModalState.show();
					}}
					class={expanded ? 'min-h-11 w-full justify-start gap-3 px-3 text-sm' : 'size-11 p-0'}
				>
					<Icon img={LogIn} size={22} />
					<span class={expanded ? '' : 'sr-only'}>Log in</span>
				</Button>
			{/if}
		</div>
	{/snippet}
</IconRail>

<div class="flex min-h-dvh flex-col sm:ml-18">
	<header
		class={hideBrand
			? 'mx-auto flex w-full max-w-3xl items-center px-6 pt-3 sm:hidden'
			: 'mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-7 pb-1'}
	>
		<div class="flex items-center gap-3">
			<IconButton
				label="Open navigation"
				aria-expanded={navigationOpen}
				aria-controls="event-navigation"
				onclick={() => (navigationOpen = true)}
				class="sm:hidden"><Icon img={Menu} size={24} /></IconButton
			>
			{#if !hideBrand}
				<a
					href={resolve('/(app)')}
					aria-label="atmo.rsvp home"
					class="text-ink focus-visible:outline-focus inline-flex items-center gap-2 outline-offset-4 focus-visible:outline-2"
				>
					<Icon img={CalendarDays} size={26} />
					<span class="text-2xl leading-none font-semibold tracking-tight"
						>atmo<span class="text-muted">.rsvp</span></span
					>
				</a>
			{/if}
		</div>
	</header>
	<main id="app-main" tabindex="-1" class="flex-1 outline-none">{@render children()}</main>
	<AppFooter subject={page.data.reportSubject} />
</div>
<LoginModal />
<CreateEventModal />

<!-- The only owner of description/social tags; routes return pageDescription and ogImage. -->
<svelte:head>
	<meta name="description" content={description} />
	<meta property="og:title" content={page.data.pageTitle ?? 'atmo.rsvp'} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:site_name" content="atmo.rsvp" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>
