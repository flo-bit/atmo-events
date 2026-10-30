<script lang="ts">
	import EventView from '../src/EventView.svelte';
	import StarterPackButton from '../src/StarterPackButton.svelte';
	import { createAdapter, event, viewer } from './fixtures.js';
</script>

<EventView
	data={{
		eventData: event,
		actorDid: event.did,
		rkey: event.rkey,
		hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
		attendees: {
			going: [{ did: event.did, name: 'Test Host', status: 'going' }],
			interested: [],
			goingCount: 1,
			interestedCount: 0
		}
	}}
	adapter={createAdapter()}
	{viewer}
	pageUrl={new URL('https://atmo.rsvp/test')}
>
	{#snippet attendeeActions()}
		<StarterPackButton
			eventUri={event.uri}
			openPack={async () => 'https://bsky.app/starter-pack/bot/pack'}
		/>
	{/snippet}
</EventView>
