<script lang="ts">
	import CreateScheduleForm from '$lib/components/scheduling/CreateScheduleForm.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Plan an Event</title>
</svelte:head>

<CreateScheduleForm actorDid={data.actorDid} />
