<script lang="ts">
	import EventEditor from '$lib/components/EventEditor.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Edit Event</title>
</svelte:head>

<EventEditor eventData={data.eventData} actorDid={data.actorDid} rkey={data.rkey} />
