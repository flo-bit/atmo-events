<script lang="ts">
	import { EventEditor, type EventEditorPrefill } from '@atmo-dev/events-ui';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';
	import { readPendingImportPrefill } from '$lib/components/CreateEventModal.svelte';

	let { data } = $props();
	let privateMode = $derived(page.url.searchParams.get('private') === '1');

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));

	// Pulled out of sessionStorage on mount so the editor sees it on its first
	// pass. EventEditor only reads `prefill` in its own onMount, so we gate
	// rendering until after this runs.
	let prefill: EventEditorPrefill | null = $state(null);
	let ready = $state(false);
	onMount(async () => {
		const pending = readPendingImportPrefill();
		if (!pending) {
			ready = true;
			return;
		}
		let thumbnailFile: File | undefined;
		if (pending.imageDataUrl) {
			try {
				const blob = await (await fetch(pending.imageDataUrl)).blob();
				const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
				thumbnailFile = new File([blob], `imported-cover.${ext}`, { type: blob.type });
			} catch (err) {
				console.error('Could not decode imported cover image:', err);
			}
		}
		prefill = {
			name: pending.name,
			description: pending.description,
			startsAt: pending.startsAt,
			endsAt: pending.endsAt,
			timezone: pending.timezone,
			mode: pending.mode,
			location: pending.location,
			links: pending.links,
			additionalData: pending.additionalData,
			...(thumbnailFile ? { thumbnailFile } : {})
		};
		ready = true;
	});
</script>

<svelte:head>
	<title>Create Event</title>
</svelte:head>

{#if ready}
	<EventEditor
		eventData={null}
		actorDid={data.actorDid}
		rkey={data.rkey}
		{privateMode}
		{adapter}
		{viewer}
		{prefill}
	/>
{/if}
