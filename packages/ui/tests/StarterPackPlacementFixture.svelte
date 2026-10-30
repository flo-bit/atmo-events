<script lang="ts">
	import EventView from '../src/EventView.svelte';
	import StarterPackButton from '../src/StarterPackButton.svelte';
	import { createAdapter, event, viewer } from './fixtures.js';
	let { goingCount = 4, interestedCount = 2 } = $props();
</script>

<EventView
	data={{
		eventData: event,
		actorDid: event.did,
		rkey: event.rkey,
		hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
		attendees: {
			going: [{ did: event.did, name: 'Test Host', status: 'going' }],
			interested: [
				{
					did: 'did:plc:zyxwvutsrqponmlkjihgfedcb',
					name: 'Interested Person',
					status: 'interested'
				}
			],
			goingCount,
			interestedCount
		}
	}}
	adapter={createAdapter()}
	{viewer}
	pageUrl={new URL('https://atmo.rsvp/test')}
>
	{#snippet attendeeActions(counts)}
		{#if counts.goingCount + counts.interestedCount > 5}
			<StarterPackButton
				eventUri={event.uri}
				openPack={async () => 'https://bsky.app/starter-pack/bot/pack'}
			/>
		{/if}
	{/snippet}
</EventView>
