<script lang="ts">
	import { EventEditor } from '@atmo-dev/kit/events';
	import type { FlatEventRecord } from '#lib/contrail.js';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { createPrivateEventAdapter } from '../editor-adapter';
	import { holdPrivateEmbeds } from '../embeds';
	import { pictureUrl } from '../pictures';

	// A host's own event.
	let {
		data
	}: {
		data: { eventData: FlatEventRecord; actorDid: string; rkey: string };
	} = $props();
	holdPrivateEmbeds();

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
	mediaUrl={pictureUrl(data.rkey)}
/>
