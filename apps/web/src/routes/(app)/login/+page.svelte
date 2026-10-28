<script lang="ts">
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		atProtoLoginModalState.show();
	});
</script>
