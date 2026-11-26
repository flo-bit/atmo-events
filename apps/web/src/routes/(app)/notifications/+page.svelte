<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, NotificationList } from '@atmo-dev/kit';
	import type { NotificationItem } from '@atmo-dev/kit';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import { notifications, notificationState } from '#lib/notifications/client.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const initialInbox = untrack(() => data.inbox);
	let items = $state<NotificationItem[]>(initialInbox?.items ?? []);
	let cursor = $state<string | null>(initialInbox?.cursor ?? null);
	let unread = $state(initialInbox?.unread ?? 0);
	let busy = $state(false);
	let error = $state('');
	$effect(() => {
		const inbox = data.inbox;
		untrack(() => {
			items = inbox?.items ?? [];
			cursor = inbox?.cursor ?? null;
			unread = notificationState.unread = inbox?.unread ?? 0;
			error = '';
		});
	});
	async function read(ids?: string[]) {
		const inbox = data.inbox;
		error = '';
		try {
			const result = await notifications.markRead(ids);
			if (data.inbox !== inbox) return;
			items = items.map((item) =>
				!ids || ids.includes(item.id) ? { ...item, readAt: Date.now() } : item
			);
			unread = notificationState.unread = result.unread;
		} catch {
			if (data.inbox === inbox) error = 'Could not mark notifications read. Try again.';
		}
	}
	async function more() {
		const inbox = data.inbox;
		busy = true;
		error = '';
		try {
			const page = await notifications.inbox({ cursor });
			if (data.inbox !== inbox) return;
			const seen = new Set(items.map((item) => item.id));
			items = [...items, ...page.items.filter((item) => !seen.has(item.id))];
			cursor = page.cursor;
			unread = notificationState.unread = page.unread;
		} catch {
			if (data.inbox === inbox) error = 'Could not load notifications. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Notifications</h1>
		{#if user.isLoggedIn}<Button href="/settings/notifications" variant="ghost">Settings</Button
			>{/if}
	</div>
	{#if !user.isLoggedIn}
		<p class="text-base-600 dark:text-base-400 mb-4">Log in to see your notifications.</p>
		<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
	{:else}
		{#if unread > 0}
			<Button variant="ghost" class="mb-3 px-0" onclick={() => read()} disabled={busy}
				>Mark all read</Button
			>
		{/if}
		<NotificationList
			{items}
			now={data.now}
			onopen={(item) => {
				if (!item.readAt) void read([item.id]);
			}}
		/>
		{#if cursor}<Button variant="secondary" class="mt-4" onclick={more} disabled={busy}
				>{busy ? 'Loading…' : 'Show more'}</Button
			>{/if}
		{#if error}<p role="alert" class="mt-4 text-sm">{error}</p>{/if}
	{/if}
</div>
