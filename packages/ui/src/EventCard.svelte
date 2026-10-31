<script lang="ts">
	import { getCDNImageBlobUrl } from './atproto-helpers.js';
	import { getEventThumbnail } from './event-media.js';
	import { eventUrl, isEventOngoing, type FlatEventRecord } from './contrail.js';
	import Avatar from 'svelte-boring-avatars';
	import { Badge, Icon } from '@atmo-dev/kit';
	import { CalendarDays, MapPin } from '@sketchyicons/svelte';
	import { getLocations, getLocationSummary } from './event-view/locations.js';

	let {
		event,
		actor
	}: {
		event: FlatEventRecord;
		actor?: string;
	} = $props();

	function formatDateTime(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	/**
	 * What a card says about an event ALREADY UNDER WAY: when it finishes, not when
	 * it began. A "Live" badge beside "Wed, Jul 1" reads as a bug, and in a list
	 * sorted by finishing time the start dates look shuffled. Day and weekday are
	 * dropped when it ends today, since the only thing a reader wants then is how
	 * long they have left.
	 */
	function formatEndsAt(endsAt: string): string {
		const end = new Date(endsAt);
		const now = new Date();
		const endsToday = end.toDateString() === now.toDateString();
		// Carry the YEAR when it is not this one. Long-running events are exactly
		// what this band surfaces — a year-long journey ending 2027-07-04 rendered
		// as "Ends Sun, Jul 4", which reads as a date three days ago.
		const endsThisYear = end.getFullYear() === now.getFullYear();
		return end.toLocaleTimeString('en-US', {
			...(endsToday
				? {}
				: {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						...(endsThisYear ? {} : { year: 'numeric' })
					}),
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getModeLabel(mode: string | undefined): string | undefined {
		if (!mode) return undefined;
		if (mode.includes('virtual')) return 'Virtual';
		if (mode.includes('hybrid')) return 'Hybrid';
		if (mode.includes('inperson')) return 'In-Person';
		return 'Event';
	}

	function getThumbnail(event: FlatEventRecord): { url: string; alt: string } | null {
		const media = getEventThumbnail(event.media);
		if (media?.content) {
			const url = getCDNImageBlobUrl({ did: event.did, blob: media.content });
			if (url) return { url, alt: media.alt || event.name };
		}

		const banner = event.media?.find((m) => m.role === 'header');
		if (banner?.content) {
			const url = getCDNImageBlobUrl({ did: event.did, blob: banner.content });
			if (url) return { url, alt: banner.alt || event.name };
		}

		return null;
	}

	let thumbnail = $derived(getThumbnail(event));
	let location = $derived(getLocationSummary(getLocations(event.locations)));
	let mode = $derived(getModeLabel(event.mode));
	let isOngoing = $derived(isEventOngoing(event.startsAt, event.endsAt));
</script>

<a
	href={eventUrl(event, actor)}
	class="group rounded-ui focus-visible:outline-focus grid grid-cols-[5rem_minmax(0,1fr)] gap-3 outline-offset-4 transition-colors focus-visible:outline-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3.5"
>
	<div class="w-full">
		{#if thumbnail}
			<img
				src={thumbnail.url}
				alt={thumbnail.alt}
				loading="lazy"
				class="border-line block aspect-square w-full rounded-[14px_12px_15px_13px] border object-cover"
			/>
		{:else}
			<div
				class="border-line aspect-square w-full overflow-hidden rounded-[14px_12px_15px_13px] border [&>svg]:h-full [&>svg]:w-full"
			>
				<Avatar
					size={96}
					name={event.rkey}
					variant="marble"
					colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
					square
				/>
			</div>
		{/if}
	</div>

	<div class="min-w-0 self-center">
		<p class="text-muted flex items-center gap-1.5 text-xs font-medium">
			<Icon img={CalendarDays} size={14} class="shrink-0" />
			{#if isOngoing && event.endsAt}
				Ends {formatEndsAt(event.endsAt)}
			{:else}
				{formatDateTime(event.startsAt)}
			{/if}
			{#if isOngoing}
				<Badge class="gap-1 px-1.5 py-0 text-[10px]">
					<span class="bg-accent-500 size-1.5 animate-pulse rounded-full"></span>
					Live
				</Badge>
			{/if}
		</p>
		<h3
			class="text-base-900 dark:text-base-50 group-hover:text-base-700 dark:group-hover:text-base-200 mt-0.5 flex items-start gap-1.5 text-sm leading-snug font-semibold transition-colors sm:text-base"
		>
			<span class="line-clamp-2">{event.name}</span>
		</h3>
		{#if location || mode}
			<p class="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				{#if location}
					<span class="inline-flex max-w-full min-w-0 items-center gap-1.5" title={location}>
						<Icon img={MapPin} size={14} class="shrink-0" />
						<span class="truncate">{location}</span>
					</span>
				{/if}
				{#if mode}
					<Badge variant="outline" class="shrink-0 px-1.5 py-0 text-[10px]">{mode}</Badge>
				{/if}
			</p>
		{/if}
	</div>
</a>
