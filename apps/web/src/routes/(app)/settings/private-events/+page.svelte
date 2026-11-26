<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import PrivateEventsBetaSetting from '#lib/private-events/components/PrivateEventsBetaSetting.svelte';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
</script>

<h1 class="mb-8 text-2xl font-semibold tracking-tight">Private events</h1>
{#if user.isLoggedIn}
	{#key user.did}<PrivateEventsBetaSetting />{/key}
{:else}
	<p class="text-base-600 dark:text-base-400 mb-4">Log in to manage private events.</p>
	<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
{/if}
