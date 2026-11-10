<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { preferredClientCache } from '#lib/atproto/preferred-client.svelte.js';
	import { AtTags, PageTitle } from '@atmo-dev/kit';
	import { configureAtproto } from '@atmo-dev/kit/events-data';
	import { serviceUrl } from '#lib/atproto/network.js';
	let { children } = $props();

	// Before any page renders: the shared components read these addresses.
	configureAtproto({ appview: serviceUrl('appview'), cdn: serviceUrl('cdn') });

	// Effects run only in the browser: never block SSR or share viewer preferences
	// across server requests. Navigation with the same DID does not trigger a read.
	$effect(() => {
		const did = page.data.did ?? null;
		untrack(() => void preferredClientCache.load(did));
	});
</script>

<PageTitle
	title={page.error ? `${page.status} — ${page.error.message}` : page.data.pageTitle}
	siteName="atmo.rsvp"
/>

<AtTags tags={page.error ? undefined : page.data.atTags} />

{@render children()}
