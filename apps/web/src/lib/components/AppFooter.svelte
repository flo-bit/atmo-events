<script lang="ts">
	import { LegalFooter, type LegalFooterLinks } from '@atmo-dev/kit';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { legalFooterLinks } from '#lib/legal/config.js';
	import { canReportSubject, type ReportSubject } from '#lib/moderation/reporting.js';
	import ReportButton from '#lib/moderation/ReportButton.svelte';

	let { subject, links = legalFooterLinks }: { subject?: ReportSubject; links?: LegalFooterLinks } =
		$props();
	const showContextReport = $derived(
		!!links.report && !!subject && canReportSubject(subject, user.isLoggedIn ? user.did : null)
	);
</script>

{#snippet contextualReport()}
	{#if subject}
		{#key subject.$type === 'com.atproto.admin.defs#repoRef' ? subject.did : subject.uri}
			<ReportButton
				{subject}
				label={subject.$type === 'com.atproto.admin.defs#repoRef'
					? 'Report account'
					: 'Report event'}
				class="min-h-0 rounded p-0 text-xs font-normal hover:bg-transparent hover:underline"
			/>
		{/key}
	{/if}
{/snippet}

<LegalFooter
	{links}
	reportAction={showContextReport ? contextualReport : undefined}
	class="mx-auto w-full max-w-3xl px-6"
/>
