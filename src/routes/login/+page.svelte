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

<div class="min-h-screen px-6 py-12">
	<div class="mx-auto flex min-h-[70vh] max-w-md items-center">
		<div>
			<p
				class="text-base-500 dark:text-base-400 mb-2 text-sm font-semibold tracking-[0.18em] uppercase"
			>
				Account
			</p>
			<h1 class="text-base-900 dark:text-base-50 text-3xl font-bold tracking-tight">Log in</h1>
			<p class="text-base-500 dark:text-base-400 mt-3 text-sm leading-relaxed">
				The login modal should open automatically. If it does not, open it manually.
			</p>

			<div class="mt-6">
				<Button onclick={() => atProtoLoginModalState.show()}>Open login modal</Button>
			</div>
		</div>
	</div>
</div>
