<script lang="ts">
	import { Button } from '@foxui/core';
	import { atProtoLoginModalState } from '@foxui/social';
	import { onMount } from 'svelte';

	onMount(() => {
		atProtoLoginModalState.show();
	});
</script>

<svelte:head>
	<title>Log In</title>
	<meta name="description" content="Log in with your Bluesky account" />
</svelte:head>

