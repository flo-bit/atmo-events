<script lang="ts">
	import EventEditor from '$lib/components/EventEditor.svelte';
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
</script>

<svelte:head>
	<title>Edit Event</title>
</svelte:head>

<EventEditor
	eventData={data.eventData}
	actorDid={data.actorDid}
	rkey={data.rkey}
	{adapter}
	{viewer}
/>
