<script lang="ts">
	import { Button, ReportDialog } from '@atmo-dev/kit';
	import { isHttpError } from '@sveltejs/kit';
	import { submitReport } from './reports.remote';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import {
		REPORT_EMAIL,
		reportSubjectUrl,
		reportErrorMessage,
		type ReportSubject
	} from './reporting';

	let {
		subject,
		label = 'Report',
		class: className
	}: { subject: ReportSubject; label?: string; class?: string } = $props();
	let open = $state(false);
</script>

<Button variant="ghost" class={className} onclick={() => (open = true)}>{label}</Button>
<ReportDialog
	bind:open
	isLoggedIn={user.isLoggedIn}
	email={REPORT_EMAIL}
	subjectUrl={reportSubjectUrl(subject)}
	onsignin={() => atProtoLoginModalState.show()}
	submit={async (input) => {
		try {
			await submitReport({ subject, ...input });
		} catch (cause) {
			return { message: reportErrorMessage(cause), needsSignIn: isHttpError(cause, 401) };
		}
	}}
/>
