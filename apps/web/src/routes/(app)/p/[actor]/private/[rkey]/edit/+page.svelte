<script lang="ts">
	import PrivateEventEditor from '#lib/private-events/components/PrivateEventEditor.svelte';

	let { data } = $props();
</script>

<PrivateEventEditor {data} />
