<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { socialClientInfo, type PreferredSocialClient } from '@atmo-dev/kit/social';
	import { starterPackClientUrl } from './starter-pack-url.js';

	let {
		eventUri,
		openPack,
		socialClient
	}: {
		eventUri: string;
		socialClient?: PreferredSocialClient | null;
		/** The host owns account access and creation; this component never writes records. */
		openPack: (eventUri: string) => Promise<string>;
	} = $props();
	let pending = $state(false);
	let message: string | null = $state(null);
	let canonicalPackUrl: string | null = $state(null);
	let packUrl = $derived(canonicalPackUrl ? starterPackClientUrl(canonicalPackUrl, socialClient) : null);
	let clientLabel = $derived(socialClientInfo(socialClient).label);

	async function open() {
		if (pending) return;
		// Open synchronously with the click so async creation doesn't hit popup blockers.
		const tab = window.open('about:blank', '_blank');
		if (tab) tab.opener = null;
		pending = true;
		message = null;
		try {
			const canonicalUrl = await openPack(eventUri);
			const url = starterPackClientUrl(canonicalUrl, socialClient);
			if (!url) throw new Error('Invalid starter pack URL');
			canonicalPackUrl = canonicalUrl;
			if (tab) {
				if (!tab.closed) tab.location.replace(url);
			} else window.location.assign(url);
		} catch {
			tab?.close();
			message = 'Couldn’t open the starter pack. Please try again.';
		} finally {
			pending = false;
		}
	}
</script>

<div class="mt-4">
	<p class="text-muted mb-1 text-xs">Follow attendees on {clientLabel}.</p>
	{#if packUrl}
		<a
			href={packUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="text-action focus-visible:outline-focus rounded text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
			>Starter pack ↗</a
		>
	{:else}
		<Button
			variant="link"
			size="sm"
			class="min-h-0 p-0 text-sm font-normal"
			onclick={open}
			disabled={pending}
		>
			{pending ? 'Opening…' : 'Starter pack ↗'}
		</Button>
	{/if}
	{#if message}
		<p role="alert" class="text-muted mt-2 text-sm">{message}</p>
	{/if}
</div>
