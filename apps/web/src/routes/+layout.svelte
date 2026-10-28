<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { PageTitle } from '@atmo-dev/kit';
	let { children } = $props();
</script>

<PageTitle
	title={page.error ? `${page.status} — ${page.error.message}` : page.data.pageTitle}
	siteName="atmo.rsvp"
/>

{@render children()}
