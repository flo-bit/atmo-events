<script lang="ts">
	import PrivateEventPage from '#lib/private-events/components/PrivateEventPage.svelte';

	let { data } = $props();
</script>

<PrivateEventPage {data} />
