<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { CalendarPlus } from '@sketchyicons/svelte';
	import { generateICalEvent } from '../cal/ical.js';
	import type { FlatEventRecord } from '../contrail.js';

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
	<Icon img={CalendarPlus} size={16} />
	Add to Calendar
</button>
