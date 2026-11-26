<script lang="ts">
	import { Button, Icon } from '@atmo-dev/kit';
	import { Bell, ChevronRight, MessageCircle, Lock } from '@sketchyicons/svelte';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const pages = $derived([
		{ title: 'Social app', href: '/settings/social', icon: MessageCircle },
		{ title: 'Notifications', href: '/settings/notifications', icon: Bell },
		...(data.privateEventsEnabled
			? [{ title: 'Private events', href: '/settings/private-events', icon: Lock }]
			: [])
	]);
</script>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
{#if !data.did}
	<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
{:else}
	<nav aria-label="Settings" class="grid gap-1">
		{#each pages as item (item.href)}
			<Button href={item.href} variant="ghost" class="min-h-14 w-full justify-start gap-3 px-3">
				<Icon img={item.icon} size={22} />
				<span class="flex-1 text-left">{item.title}</span>
				<Icon img={ChevronRight} size={18} />
			</Button>
		{/each}
	</nav>
{/if}
