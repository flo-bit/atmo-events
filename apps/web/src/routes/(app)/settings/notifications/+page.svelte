<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import NotificationPreferences from '#lib/notifications/Preferences.svelte';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
</script>

<h1 class="mb-8 text-2xl font-semibold tracking-tight">Notifications</h1>
{#if user.isLoggedIn}
	{#key user.did}<NotificationPreferences />{/key}
{:else}
	<p class="text-base-600 dark:text-base-400 mb-4">Log in to manage your notifications.</p>
	<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
{/if}
