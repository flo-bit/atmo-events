<script lang="ts">
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		atProtoLoginModalState.show();
	});
</script>

<svelte:head>
	<title>Log In</title>
	<meta name="description" content="Log in with your Bluesky account" />
</svelte:head>

