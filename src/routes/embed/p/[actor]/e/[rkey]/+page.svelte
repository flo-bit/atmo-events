<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Avatar from 'svelte-boring-avatars';
	import { notifyContrailOfUpdate } from '$lib/contrail';

	interface AtmoEmbedSDK {
		getParams(): { base: string; accent: string; dark: boolean; did: string | null };
		createRecord(opts: { collection: string; rkey?: string; record: Record<string, unknown> }): Promise<{ uri: string }>;
		deleteRecord(opts: { collection: string; rkey: string }): Promise<void>;
	}

	declare global {
		interface Window {
			AtmoEmbed?: AtmoEmbedSDK;
		}
	}

	let { data } = $props();

	let rsvpStatus: 'going' | 'interested' | 'notgoing' | null = $state(untrack(() => data.viewerRsvpStatus));
	let rsvpRkey: string | null = $state(untrack(() => data.viewerRsvpRkey));
	let submitting = $state(false);

	let eventUrl = $derived(`https://atmo.rsvp/p/${data.actorDid}/e/${data.rkey}`);

	let startDate = $derived(new Date(data.eventData.startsAt));
	let endDate = $derived(data.eventData.endsAt ? new Date(data.eventData.endsAt) : null);

	function formatDate(date: Date): string {
		const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		if (date.getFullYear() !== new Date().getFullYear()) {
			options.year = 'numeric';
		}
		return date.toLocaleDateString('en-US', options);
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function getLocationString(): string | null {
		const locations = data.eventData.locations;
		if (!locations || locations.length === 0) return null;
		const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
			| { name?: string; street?: string; locality?: string; region?: string }
			| undefined;
		if (!loc) return null;
		if (loc.name) return loc.name;
		const parts = [loc.locality, loc.region].filter(Boolean);
		return parts.length > 0 ? parts.join(', ') : null;
	}

	let location = $derived(getLocationString());

	let isSameDay = $derived(
		endDate &&
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth() &&
		startDate.getDate() === endDate.getDate()
	);


	async function submitRsvp(status: 'going' | 'interested') {
		if (!window.AtmoEmbed || !data.viewerDid) return;
		submitting = true;
		try {
			const result = await window.AtmoEmbed.createRecord({
				collection: 'community.lexicon.calendar.rsvp',
				record: {
					$type: 'community.lexicon.calendar.rsvp',
					createdWith: 'https://atmo.rsvp',
					status: `community.lexicon.calendar.rsvp#${status}`,
					subject: {
						uri: data.eventUri,
						...(data.eventCid ? { cid: data.eventCid } : {})
					},
					createdAt: new Date().toISOString()
				}
			});
			rsvpStatus = status;
			if (result?.uri) {
				const parts = result.uri.split('/');
				rsvpRkey = parts[parts.length - 1];
				notifyContrailOfUpdate(result.uri);
			}
		} catch (e) {
			console.error('RSVP failed:', e);
		} finally {
			submitting = false;
		}
	}

	async function cancelRsvp() {
		if (!window.AtmoEmbed || !rsvpRkey || !data.viewerDid) return;
		submitting = true;
		const rsvpUri = `at://${data.viewerDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`;
		try {
			await window.AtmoEmbed.deleteRecord({
				collection: 'community.lexicon.calendar.rsvp',
				rkey: rsvpRkey
			});
			notifyContrailOfUpdate(rsvpUri);
			rsvpStatus = null;
			rsvpRkey = null;
		} catch (e) {
			console.error('Cancel RSVP failed:', e);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<!-- Apply theme classes before paint to avoid flash -->
	<script>
		var p = new URLSearchParams(location.search);
		var h = document.documentElement;
		var b = p.get('base'); if (b) h.classList.add(b);
		var a = p.get('accent'); if (a) h.classList.add(a);
		if (p.get('dark') === '1') h.classList.add('dark');
	</script>
	<script src="https://atmo.social/embed-sdk.js"></script>
</svelte:head>

<div class="@container bg-base-200 dark:bg-base-950/50 text-base-900 dark:text-base-50 flex h-full items-center gap-4 overflow-hidden p-3 @sm:gap-5 @sm:p-4 @lg:gap-8 @lg:p-6">
	<!-- Thumbnail -->
	<a href={eventUrl} target="_blank" rel="noopener noreferrer" class="shrink-0">
		<div class="aspect-square h-[calc(100cqh-1.5rem)] max-h-40 overflow-hidden rounded-xl @sm:h-[calc(100cqh-2rem)] @sm:rounded-2xl @lg:h-[calc(100cqh-3rem)] @lg:max-h-56">
			{#if data.thumbnailUrl}
				<img
					src={data.thumbnailUrl}
					alt={data.eventData.name}
					class="size-full object-cover"
				/>
			{:else}
				<div class="size-full [&>svg]:size-full">
					<Avatar
						size={200}
						name={data.rkey}
						variant="marble"
						colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
						square
					/>
				</div>
			{/if}
		</div>
	</a>

	<!-- Details + RSVP -->
	<div class="flex min-w-0 flex-1 flex-col justify-center gap-1 @sm:gap-1.5 @lg:gap-3">
		<a href={eventUrl} target="_blank" rel="noopener noreferrer" class="min-w-0">
			<h2 class="line-clamp-2 text-xs leading-snug font-semibold @sm:text-base @lg:text-xl">{data.eventData.name}</h2>
			<p class="text-base-500 dark:text-base-400 mt-0.5 truncate text-[11px] @sm:mt-1 @sm:text-sm @lg:text-base">
				{formatDate(startDate)}, {formatTime(startDate)}{#if endDate && isSameDay} - {formatTime(endDate)}{/if}
			</p>
			{#if location}
				<p class="text-base-500 dark:text-base-400 truncate text-[11px] @sm:text-sm @lg:text-base">{location}</p>
			{/if}
			{#if data.hostProfile}
				<p class="text-base-400 dark:text-base-500 truncate text-[11px] @sm:text-sm @lg:text-base">
					by {data.hostProfile.displayName || data.hostProfile.handle || data.actorDid}
				</p>
			{/if}
		</a>

		<!-- RSVP -->
		{#if data.viewerDid}
		<div class="border-base-300 dark:border-base-800 bg-base-100 dark:bg-base-900/50 mt-2 flex flex-col justify-center rounded-lg border px-2 py-2 @sm:mt-3 @sm:rounded-xl @sm:px-3 @sm:py-3 @lg:mt-4 @lg:rounded-2xl @lg:px-4 @lg:py-4">
			{#if rsvpStatus === 'going'}
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5 @sm:gap-2.5 @lg:gap-3">
						<div class="flex size-5 items-center justify-center rounded-full bg-green-100 @sm:size-6 @lg:size-8 dark:bg-green-900/30">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3 @sm:size-3.5 @lg:size-4 text-green-600 dark:text-green-400">
								<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
							</svg>
						</div>
						<span class="text-base-900 dark:text-base-50 text-[11px] font-semibold @sm:text-sm @lg:text-base">You're Going</span>
					</div>
					<button onclick={cancelRsvp} disabled={submitting} class="text-base-400 hover:text-base-600 dark:text-base-500 dark:hover:text-base-300 cursor-pointer transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 @sm:size-4 @lg:size-5">
							<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
						</svg>
					</button>
				</div>
			{:else if rsvpStatus === 'interested'}
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5 @sm:gap-2.5 @lg:gap-3">
						<div class="flex size-5 items-center justify-center rounded-full bg-amber-100 @sm:size-6 @lg:size-8 dark:bg-amber-900/30">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3 @sm:size-3.5 @lg:size-4 text-amber-600 dark:text-amber-400">
								<path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" />
							</svg>
						</div>
						<span class="text-base-900 dark:text-base-50 text-[11px] font-semibold @sm:text-sm @lg:text-base">You're Interested</span>
					</div>
					<button onclick={cancelRsvp} disabled={submitting} class="text-base-400 hover:text-base-600 dark:text-base-500 dark:hover:text-base-300 cursor-pointer transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 @sm:size-4 @lg:size-5">
							<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
						</svg>
					</button>
				</div>
			{:else}
				<div class="flex gap-1.5 @sm:gap-2 @lg:gap-3">
					<button
						onclick={() => submitRsvp('going')}
						disabled={submitting}
						class="bg-accent-600 hover:bg-accent-700 flex-1 cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-white transition-colors disabled:opacity-50 @sm:rounded-lg @sm:px-4 @sm:py-1.5 @sm:text-sm @lg:px-5 @lg:py-2 @lg:text-base"
					>Going</button>
					<button
						onclick={() => submitRsvp('interested')}
						disabled={submitting}
						class="bg-base-300 dark:bg-base-800 hover:bg-base-400 dark:hover:bg-base-700 text-base-700 dark:text-base-300 flex-1 cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 @sm:rounded-lg @sm:px-4 @sm:py-1.5 @sm:text-sm @lg:px-5 @lg:py-2 @lg:text-base"
					>Interested</button>
				</div>
			{/if}
		</div>
		{/if}
	</div>
</div>
