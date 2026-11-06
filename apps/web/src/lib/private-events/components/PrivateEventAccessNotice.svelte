<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { requestPermissions } from '@svelte-atproto/oauth/client';
	import { markAsked, type PrivateEventAccess } from '../permissions-asked';

	let {
		access,
		did,
		scopes,
		purpose,
		label,
		returnTo,
		spacesServer = null
	}: {
		access: PrivateEventAccess;
		/** The signed-in person's DID, remembered with the ask. */
		did: string;
		scopes: readonly string[];
		/** What granting it lets the person do here. */
		purpose: string;
		label: string;
		/** Where to come back to, when it isn't this address. */
		returnTo?: string;
		spacesServer?: { url: string; host: string } | null;
	} = $props();

	let busy = $state(false);
	let failure: string | null = $state(null);

	async function ask() {
		busy = true;
		failure = null;
		try {
			markAsked(did);
			await requestPermissions([...scopes], returnTo ? { returnTo } : { saveReturnTo: true });
		} catch {
			failure = 'That did not work. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

{#snippet pointer()}
	{#if spacesServer}
		You can make an account at
		<!-- Another site's address, from this site's settings, so there is nothing to resolve. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={spacesServer.url}
			rel="external noopener"
			class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 font-medium"
			>{spacesServer.host}</a
		><!-- eslint-enable svelte/no-navigation-without-resolve -->, which can, and sign in to atmo
		with it.
	{/if}
{/snippet}

<div
	class="rounded-ui border-base-200 dark:border-base-800 mt-4 border p-4"
	data-testid="grant-notice"
>
	{#if failure}<p role="alert" class="mb-2 text-sm text-red-600">{failure}</p>{/if}
	{#if access === 'ask'}
		<p class="text-base-700 dark:text-base-300 text-sm">{purpose}</p>
		<Button class="mt-3" disabled={busy} onclick={ask}>{label}</Button>
	{:else}
		<p class="text-base-700 dark:text-base-300 text-sm" role="status">
			Your server did not give atmo permission for private events. Most servers can't do them yet:
			it takes spaces support, the part of atproto that keeps them private.
		</p>
		{#if spacesServer}<p class="text-muted mt-2 text-sm">{@render pointer()}</p>{/if}
		<Button class="mt-3" size="sm" variant="ghost" disabled={busy} onclick={ask}>Try again</Button>
	{/if}
</div>
