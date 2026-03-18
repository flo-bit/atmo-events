<script lang="ts">
	import EventEditor from '$lib/components/EventEditor.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Create Event</title>
</svelte:head>

<EventEditor eventData={null} actorDid={data.actorDid} rkey={data.rkey} />
