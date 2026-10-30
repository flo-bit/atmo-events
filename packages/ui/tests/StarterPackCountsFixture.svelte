<script lang="ts">
	import EventAttendees from '../src/EventAttendees.svelte';
	import StarterPackButton from '../src/StarterPackButton.svelte';
	import { event } from './fixtures.js';
	let attendees: EventAttendees | undefined = $state();
	const did = 'did:plc:newviewer';
</script>

<button onclick={() => attendees?.addAttendee({ did, name: 'Viewer', status: 'going' })}
	>Join</button
>
<button onclick={() => attendees?.addAttendee({ did, name: 'Viewer', status: 'interested' })}
	>Switch to interested</button
>
<button onclick={() => attendees?.removeAttendee(did)}>Cancel RSVP</button>
<EventAttendees
	bind:this={attendees}
	going={[{ did: event.did, name: 'Host', status: 'going' }]}
	interested={[{ did: 'did:plc:interested', name: 'Interested person', status: 'interested' }]}
	goingCount={4}
	interestedCount={1}
>
	{#snippet footer({ goingCount, interestedCount })}
		{#if goingCount + interestedCount > 5}
			<StarterPackButton
				eventUri={event.uri}
				openPack={async () => 'https://bsky.app/starter-pack/bot/pack'}
			/>
		{/if}
	{/snippet}
</EventAttendees>
