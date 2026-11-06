<script lang="ts">
	import { EventEditor } from '@atmo-dev/kit/events';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { createPrivateEventAdapter } from '#lib/private-events/editor-adapter.js';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		canPostToBluesky: false,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createPrivateEventAdapter(viewer));
</script>

<EventEditor
	eventData={data.eventData}
	actorDid={data.actorDid}
	rkey={data.rkey}
	{adapter}
	{viewer}
/>
