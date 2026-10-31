<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { login } from '@svelte-atproto/oauth/client';
	import {
		requiredScopes,
		moderationActionScope,
		blueskyPostingScope
	} from '#lib/atproto/settings.js';
	import {
		loadReports,
		resolveReport,
		hideSubject,
		undoAction
	} from '#lib/moderation/reports.remote.js';
	import ReportInbox from '#lib/moderation/ReportInbox.svelte';

	let { data } = $props();
</script>

<ReportInbox
	{data}
	basePath={resolve('/(app)/mod')}
	actions={{
		load: loadReports,
		resolve: resolveReport,
		hide: hideSubject,
		undo: undoAction,
		refresh: invalidateAll,
		authorize: () =>
			login(data.did!, {
				scope: [
					...requiredScopes,
					moderationActionScope,
					...(data.canPostToBluesky ? [blueskyPostingScope] : [])
				],
				saveReturnTo: true
			})
	}}
/>
