<script lang="ts">
	import {
		type GridEvent,
		linkableTypes,
		isLightning,
		getEventColor,
		durationMinutes,
		formatTime
	} from './schedule-utils';

	let { event }: { event: GridEvent } = $props();
</script>

{#if linkableTypes.has(event.type) && event.rkey}
	<a
		href="/p/atmosphereconf.org/e/{event.rkey}"
		class="flex-1 overflow-hidden rounded-md leading-tight transition-[filter] hover:brightness-95 {getEventColor(
			event.type
		)} {event.type === 'info'
			? 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {isLightning(event.type) ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.speakers?.length && !isLightning(event.type)}
			<p class="mt-0.5 opacity-75">{event.speakers.map((s) => s.name).join(', ')}</p>
		{/if}
	</a>
{:else}
	<div
		class="flex-1 overflow-hidden rounded-md leading-tight {getEventColor(
			event.type
		)} {event.type === 'info'
			? durationMinutes(event.start, event.end) <= 30
				? 'flex items-center justify-center gap-2 px-2 py-0.5 text-center text-xs'
				: 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {isLightning(event.type) ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.start}
			<p class="{durationMinutes(event.start, event.end) <= 30 ? '' : 'mt-0.5'} opacity-75 shrink-0">
				{formatTime(event.start)}{event.end ? ` – ${formatTime(event.end)}` : ''}
			</p>
		{/if}
	</div>
{/if}
