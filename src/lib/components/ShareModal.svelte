<script lang="ts">
	import { Modal, Button, Avatar } from '@foxui/core';
	import { LinkCard } from '@foxui/social';
	import { user } from '$lib/atproto/auth.svelte';
	import PostToBlueskyModal from '$lib/components/PostToBlueskyModal.svelte';

	let {
		open = $bindable(false),
		url,
		title = 'Event created!',
		shareText,
		eventName,
		ogImageUrl,
		canSetEventComments = false,
		eventDid,
		eventRkey,
		eventDescription,
		onPosted
	}: {
		open: boolean;
		url: string;
		title?: string;
		shareText?: string;
		eventName?: string;
		ogImageUrl?: string;
		canSetEventComments?: boolean;
		eventDid?: string;
		eventRkey?: string;
		eventDescription?: string;
		onPosted?: (ref: { uri: string; cid: string; showComments: boolean }) => void;
	} = $props();

	let copiedUrl = $state(false);
	let copiedText = $state(false);
	let showPostModal = $state(false);

	let textBeforeUrl = $derived(shareText ? shareText.replace(url, '').trim() : undefined);

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(url);
			copiedUrl = true;
			setTimeout(() => (copiedUrl = false), 2000);
		} catch {}
	}

	async function copyText() {
		if (!shareText) return;
		try {
			await navigator.clipboard.writeText(shareText);
			copiedText = true;
			setTimeout(() => (copiedText = false), 2000);
		} catch {}
	}

	let blueskyButton: HTMLElement | null = $state(null);

	let canPostDirectly = $derived(
		!!eventDid && !!eventRkey && !!eventName && user.isLoggedIn
	);

	let blueskyIntentUrl = $derived(
		`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText || url)}`
	);

	function handleBlueskyClick() {
		showPostModal = true;
	}

	function handlePostedFromInner(ref: { uri: string; cid: string; showComments: boolean }) {
		onPosted?.(ref);
		open = false;
	}
</script>

<Modal
	bind:open
	onOpenAutoFocus={(e) => {
		e.preventDefault();
		blueskyButton?.focus();
	}}
>
	<div>
		<h2 class="text-base-900 dark:text-base-50 mb-2 text-xl font-bold">{title}</h2>
		<p class="text-base-500 dark:text-base-400 mb-4 text-sm">Share it with others!</p>

		<div
			class="bg-base-200 dark:bg-base-950/30 border-base-400/40 dark:border-base-700 mb-6 overflow-hidden rounded-xl border px-4 py-3 text-left"
		>
			{#if user.profile}
				<div class="flex items-center gap-2 pb-4">
					<Avatar src={user.profile.avatar} alt="" class="size-6" />
					<span class="text-base-700 dark:text-base-200 text-sm font-medium"
						>{user.profile.handle}</span
					>
				</div>
			{/if}
			{#if textBeforeUrl}
				<p class="text-base-700 dark:text-base-200 text-md font-semibold">{textBeforeUrl}</p>
			{/if}
			{#if eventName}
				<LinkCard
					href={url}
					meta={{
						title: eventName,
						image: ogImageUrl
					}}
					class="mb-1"
				/>
			{/if}
		</div>

		<div class="flex flex-col gap-2 sm:flex-row">
			<Button class="flex-1" variant="secondary" onclick={copyUrl}>
				{copiedUrl ? 'Copied!' : 'Copy link'}
			</Button>
			{#if shareText}
				<Button class="flex-1" variant="secondary" onclick={copyText}>
					{copiedText ? 'Copied!' : 'Copy text'}
				</Button>
			{/if}
			{#if canPostDirectly}
				<Button bind:ref={blueskyButton} class="flex-1" onclick={handleBlueskyClick}>
					Share to Bluesky
				</Button>
			{:else}
				<Button
					bind:ref={blueskyButton}
					class="flex-1"
					href={blueskyIntentUrl}
					target="_blank"
					rel="noopener"
				>
					Share to Bluesky
				</Button>
			{/if}
		</div>
	</div>
</Modal>

{#if canPostDirectly && eventDid && eventRkey && eventName}
	<PostToBlueskyModal
		bind:open={showPostModal}
		{canSetEventComments}
		{eventDid}
		{eventRkey}
		{eventName}
		eventUrl={url}
		{eventDescription}
		{ogImageUrl}
		initialText={textBeforeUrl ?? eventName}
		onPosted={handlePostedFromInner}
	/>
{/if}
