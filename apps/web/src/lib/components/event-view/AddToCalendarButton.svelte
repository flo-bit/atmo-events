<script lang="ts">
	import { generateICalEvent } from '$lib/cal/ical';
	import type { FlatEventRecord } from '$lib/contrail';

	let {
		eventData,
		eventUri,
		pageHref
	}: { eventData: FlatEventRecord; eventUri: string; pageHref: string } = $props();

	function downloadIcs() {
		const ical = generateICalEvent(eventData, eventUri, pageHref);
		const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${eventData.name.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<button
	onclick={downloadIcs}
	class="text-base-700 dark:text-base-300 hover:text-base-900 dark:hover:text-base-100 flex cursor-pointer items-center gap-2 text-sm font-medium transition-colors"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="size-4"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
		/>
	</svg>
	Add to Calendar
</button>
