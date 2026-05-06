<script lang="ts">
	import { EventEditor } from '@atmo-dev/events-ui';
	import { page } from '$app/state';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';

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
</script>

<svelte:head>
	<title>Create Event</title>
</svelte:head>

<EventEditor
	eventData={null}
	actorDid={data.actorDid}
	rkey={data.rkey}
	{privateMode}
	{adapter}
	{viewer}
/>
