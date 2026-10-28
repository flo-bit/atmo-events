<script lang="ts">
	import { ArrowUpRight } from '@sketchyicons/svelte';
	import { Button, Icon } from '@atmo-dev/kit';

	// Shown in place of the RSVP controls for imported events whose host opted out
	// of atmo RSVPs (additionalData.externalSource.rsvpMode === 'external_only').
	// Directs attendees to the original event page instead.
	let { url }: { url: string } = $props();

	let host = $derived.by(() => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return null;
		}
	});
</script>

<div
	class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
>
	<div class="min-w-0">
		<p class="text-base-900 dark:text-base-50 text-sm font-semibold">RSVP on the original page</p>
		<p class="text-base-600 dark:text-base-400 mt-0.5 text-xs">
			{host
				? `This event is hosted on ${host}. Head there to RSVP.`
				: 'This event is hosted elsewhere. Open the original page to RSVP.'}
		</p>
	</div>
	<Button href={url} target="_blank" rel="noopener noreferrer" class="shrink-0">
		{host ? `RSVP on ${host}` : 'Open original event'}
		<Icon img={ArrowUpRight} size={16} class="shrink-0" />
	</Button>
</div>
