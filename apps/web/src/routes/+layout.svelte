<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { AtTags, PageTitle } from '@atmo-dev/kit';
	let { children } = $props();
</script>

<PageTitle
	title={page.error ? `${page.status} — ${page.error.message}` : page.data.pageTitle}
	siteName="atmo.rsvp"
/>

<AtTags tags={page.error ? undefined : page.data.atTags} />

{@render children()}
