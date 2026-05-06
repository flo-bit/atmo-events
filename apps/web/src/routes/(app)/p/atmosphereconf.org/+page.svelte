<script lang="ts">
	import { getProfileBlobUrl } from '$lib/contrail';
	import { user, logout } from '$lib/atproto/auth.svelte';
	import UserProfile from '$lib/components/UserProfile.svelte';
	import { Button, ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import DaySchedule from './DaySchedule.svelte';
	import Countdown from './Countdown.svelte';
	import {
		getScheduleEvents,
		getDayKey,
		getDayLabel,
		getRooms,
		buildGrid,
		isoToMinutes
	} from './schedule-utils';
	import { onMount } from 'svelte';

	let { data } = $props();

	let hostProfile = $derived(data.hostProfile);
	let hostDid = $derived(hostProfile?.did ?? '');
	let isOwnProfile = $derived(user.isLoggedIn && !!hostDid && user.did === hostDid);
	let hostName = $derived(
		hostProfile?.value?.displayName || hostProfile?.handle || 'ATmosphereConf'
	);

	let scheduleEvents = $derived(getScheduleEvents(data.events));
	let rsvpStatuses: Record<string, string> = $state(data.rsvpStatuses ?? {});
	let rsvpRkeys: Record<string, string> = $state(data.rsvpRkeys ?? {});
	let eventVods = $derived(data.eventVods ?? {});
	let filterMode: string = $state('all');
	let selectedDay: string = $state('all');

	let dayGroups = $derived.by(() => {
		const groups = new Map<
			string,
			{ key: string; label: string; shortLabel: string; events: typeof scheduleEvents }
		>();
		for (const event of scheduleEvents) {
			const key = getDayKey(event.start);
			if (!groups.has(key)) {
				const label = getDayLabel(event.start);
				const shortLabel = new Date(event.start).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Vancouver' });
				groups.set(key, { key, label, shortLabel, events: [] });
			}
			groups.get(key)!.events.push(event);
		}
		return [...groups.values()];
	});

	let filteredDayGroups = $derived(
		selectedDay === 'all' ? dayGroups : dayGroups.filter((d) => d.key === selectedDay)
	);

	let activeRooms: Record<number, number> = $state({});

	let now = $state(new Date());

	onMount(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(interval);
	});

	let nowIso = $derived(now.toISOString());
	let nowVancouverKey = $derived(getDayKey(nowIso));
	let nowVancouverMinutes = $derived(isoToMinutes(nowIso));

	let firstEventStart = $derived(scheduleEvents.length > 0 ? scheduleEvents[0].start : null);
	let isBeforeConference = $derived(firstEventStart ? now < new Date(firstEventStart) : false);

	let isNowDuringConference = $derived.by(() => {
		if (scheduleEvents.length === 0) return false;
		const first = scheduleEvents[0].start;
		const last = scheduleEvents[scheduleEvents.length - 1];
		const lastEnd = last.end || last.start;
		return now >= new Date(first) && now <= new Date(lastEnd);
	});

	function handleRsvpChange(uri: string, status: string | null, rkey?: string) {
		if (status) {
			rsvpStatuses = { ...rsvpStatuses, [uri]: status };
			if (rkey) rsvpRkeys = { ...rsvpRkeys, [uri]: rkey };
		} else {
			const { [uri]: _, ...rest } = rsvpStatuses;
			rsvpStatuses = rest;
			const { [uri]: __, ...restKeys } = rsvpRkeys;
			rsvpRkeys = restKeys;
		}
	}

	function scrollToNow() {
		const els = document.querySelectorAll('[data-now-line]');
		for (const el of els) {
			if (el instanceof HTMLElement && el.offsetParent !== null) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return;
			}
		}
		els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<svelte:head>
	<title>{hostName}</title>
</svelte:head>

<div class="px-6 py-1 sm:py-2">
	<div class="mx-auto max-w-3xl px-0 sm:px-4">
		<UserProfile
			profile={{
				handle: hostProfile?.handle,
				displayName: hostName,
				avatar: hostProfile?.value?.avatar
					? getProfileBlobUrl(hostDid, hostProfile.value.avatar)
					: undefined
			}}
		>
			{#snippet actions()}
				{#if isOwnProfile}
					<Button onclick={logout} variant="secondary" class="rose">Logout</Button>
				{/if}
			{/snippet}
		</UserProfile>

		<p class="text-base-500 dark:text-base-400 mb-2 text-sm">
			See all info on the <a
				href="https://atmosphereconf.org/"
				target="_blank"
				rel="noopener noreferrer"
				class="text-accent-600 dark:text-accent-400 hover:underline">official website</a
			>. All times are shown in your local timezone.
		</p>

		{#if isBeforeConference && firstEventStart}
			<div class="my-24">
				<Countdown targetDate={firstEventStart} />
			</div>
		{/if}

		<div class="mt-8 mb-6 flex items-center justify-between">
			<h2 class="text-base-900 dark:text-base-50 text-2xl font-bold">Schedule</h2>
			{#if isNowDuringConference}
				<Button onclick={scrollToNow} size="sm">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="size-4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
						/>
					</svg>
					Jump to now
				</Button>
			{/if}
		</div>

		<div class="mb-6 space-y-3">
			<div class="flex items-center gap-3">
				<span class="text-base-500 dark:text-base-400 w-14 text-xs">Days</span>
				<ToggleGroup
					type="single"
					bind:value={
						() => selectedDay,
						(v) => {
							if (v) selectedDay = v;
						}
					}
					class="w-fit"
				>
					<ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
					{#each dayGroups as day}
						<ToggleGroupItem value={day.key} size="sm">{day.shortLabel}</ToggleGroupItem>
					{/each}
				</ToggleGroup>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-base-500 dark:text-base-400 w-14 text-xs">Events</span>
				<ToggleGroup
					type="single"
					bind:value={
						() => filterMode,
						(v) => {
							if (v) filterMode = v;
						}
					}
					class="w-fit"
				>
					<ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
					<ToggleGroupItem value="recorded" size="sm">Recorded</ToggleGroupItem>
					{#if data.loggedIn}
						<ToggleGroupItem value="attending" size="sm">Attending</ToggleGroupItem>
					{/if}
				</ToggleGroup>
			</div>
		</div>

		{#each filteredDayGroups as day, dayIndex}
			{@const rooms = getRooms(day.events)}
			{@const grid = buildGrid(day.events, rooms)}

			<section class="isolate mb-12">
				<h3 class="text-base-900 dark:text-base-50 mb-4 text-lg font-bold">{day.label}</h3>
				<DaySchedule
					{grid}
					{rooms}
					{dayIndex}
					dayEvents={day.events}
					bind:activeRoom={() => activeRooms[dayIndex] ?? 0, (v) => (activeRooms[dayIndex] = v)}
					{nowVancouverKey}
					{nowVancouverMinutes}
					{rsvpStatuses}
					{rsvpRkeys}
					{eventVods}
					dimUnattended={filterMode === 'attending'}
					dimUnrecorded={filterMode === 'recorded'}
					loggedIn={data.loggedIn}
					onrsvpchange={handleRsvpChange}
				/>
			</section>
		{/each}
	</div>
</div>
