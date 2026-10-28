<script lang="ts">
	import { EventEditor } from '@atmo-dev/events-ui';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { createInAppAdapter } from '#lib/components/editor/adapter.js';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		canPostToBluesky: user.canPostToBluesky,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));
</script>

<EventEditor
	eventData={data.eventData}
	actorDid={data.actorDid}
	rkey={data.rkey}
	{adapter}
	{viewer}
/>
