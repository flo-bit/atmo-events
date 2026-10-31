<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { PageTitle } from '@atmo-dev/kit';
	import { configureAtproto } from '@atmo-dev/events-ui';
	import { serviceUrl } from '#lib/atproto/network.js';
	let { children } = $props();

	// Before any page renders: the shared components read these addresses.
	configureAtproto({ appview: serviceUrl('appview'), cdn: serviceUrl('cdn') });
</script>

<PageTitle
	title={page.error ? `${page.status} — ${page.error.message}` : page.data.pageTitle}
	siteName="atmo.rsvp"
/>

{@render children()}
