<script lang="ts">
	import { getCDNImageBlobUrl } from '$lib/atproto';
	import type { FlatEventRecord } from '$lib/contrail';
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
</script>

<a
	href="/p/{actor || event.did}/e/{event.rkey}"
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
		<p class="text-base-500 dark:text-base-400 text-xs font-medium">
			{formatDateTime(event.startsAt)}
		</p>
		<h3
			class="text-base-900 dark:text-base-50 group-hover:text-base-700 dark:group-hover:text-base-200 mt-0.5 line-clamp-2 text-sm leading-snug font-semibold transition-colors sm:text-base"
		>
			{event.name}
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
