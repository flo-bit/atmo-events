<script lang="ts">
	import { getCDNImageBlobUrl } from './atproto-helpers.js';
	import { eventUrl, isEventOngoing, type FlatEventRecord } from './contrail.js';
	import Avatar from 'svelte-boring-avatars';

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

	function getModeLabel(mode: string | undefined): string | undefined {
		if (!mode) return undefined;
		if (mode.includes('virtual')) return 'Virtual';
		if (mode.includes('hybrid')) return 'Hybrid';
		if (mode.includes('inperson')) return 'In-Person';
		return 'Event';
	}

	function getLocationString(locations: FlatEventRecord['locations']): string | undefined {
		if (!locations?.length) return undefined;

		const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
			| { locality?: string; region?: string }
			| undefined;
		if (!loc) return undefined;

		return [loc.locality, loc.region].filter(Boolean).join(', ') || undefined;
	}

	function getThumbnail(event: FlatEventRecord): { url: string; alt: string } | null {
		const media = event.media?.find((m) => m.role === 'thumbnail');
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
	let location = $derived(getLocationString(event.locations));
	let mode = $derived(getModeLabel(event.mode));
	let isOngoing = $derived(isEventOngoing(event.startsAt, event.endsAt));
</script>

<a
	href={eventUrl(event, actor)}
	class="group grid grid-cols-[4rem_1fr] gap-3 transition-colors sm:grid-cols-[5rem_1fr] sm:gap-4"
>
	<div class="w-full">
		{#if thumbnail}
			<img
				src={thumbnail.url}
				alt={thumbnail.alt}
				class="border-base-200 dark:border-base-800 aspect-square w-full rounded-2xl border object-cover"
			/>
		{:else}
			<div
				class="border-base-200 dark:border-base-800 aspect-square w-full overflow-hidden rounded-2xl border [&>svg]:h-full [&>svg]:w-full"
			>
				<Avatar
					size={80}
					name={event.rkey}
					variant="marble"
					colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
					square
				/>
			</div>
		{/if}
	</div>

	<div class="min-w-0 self-center">
		<p class="text-base-500 dark:text-base-400 flex items-center gap-1.5 text-xs font-medium">
			{formatDateTime(event.startsAt)}
			{#if isOngoing}
				<span class="inline-flex items-center gap-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">
					<span class="size-1.5 rounded-full bg-accent-500 animate-pulse"></span>
					Live
				</span>
			{/if}
		</p>
		<h3
			class="text-base-900 dark:text-base-50 group-hover:text-base-700 dark:group-hover:text-base-200 mt-0.5 flex items-start gap-1.5 text-sm leading-snug font-semibold transition-colors sm:text-base"
		>
			{#if event.space}
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-base-500 dark:text-base-400 mt-1 size-3.5 shrink-0"
					aria-label="Private event"
				>
					<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			{/if}
			<span class="line-clamp-2">{event.name}</span>
		</h3>
		{#if location || mode}
			<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
				{#if location}{location}{/if}
				{#if location && mode}
					<span class="mx-1">&middot;</span>
				{/if}
				{#if mode}{mode}{/if}
			</p>
		{/if}
	</div>
</a>
