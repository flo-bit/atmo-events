<script lang="ts">
	import AvailabilityGrid from '$lib/components/scheduling/AvailabilityGrid.svelte';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { Button, Avatar as FoxAvatar } from '@foxui/core';
	import { goto } from '$app/navigation';
	import { formatSlotInTz, getTimezoneAbbr } from '$lib/scheduling/timezones';
	import type { PollOption } from '$lib/scheduling/types';

	let { data } = $props();

	let mySlots = $state(data.mySlots);
	let submitting = $state(false);
	let saved = $state(false);
	let voting = $state(false);
	let myVote: number | null = $state(data.myVote);
	let copied = $state(false);
	let hoveredDid: string | null = $state(null);
	let hoveredOption: { start: string; end: string } | null = $state(null);

	let highlightSlots = $derived.by(() => {
		if (hoveredDid) {
			const slots = data.participantSlots[hoveredDid];
			return slots ? new Set(slots) : null;
		}
		if (hoveredOption) {
			const startMs = new Date(hoveredOption.start).getTime();
			const endMs = new Date(hoveredOption.end).getTime();
			const matching = data.allSlots.filter((s) => {
				const ms = new Date(s).getTime();
				return ms >= startMs && ms < endMs;
			});
			return new Set(matching);
		}
		return null;
	});

	function copyLink() {
		navigator.clipboard.writeText(window.location.href);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const tz = data.request.organizer_tz;
	const tzAbbr = getTimezoneAbbr(tz);

	async function saveAvailability() {
		submitting = true;
		saved = false;
		try {
			const res = await fetch('/schedule/api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'respond',
					request_id: data.request.id,
					slots: mySlots
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
			saved = true;
			setTimeout(() => location.reload(), 600);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			submitting = false;
		}
	}

	async function lockAvailability() {
		submitting = true;
		try {
			const res = await fetch('/schedule/api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'generate_poll',
					request_id: data.request.id
				})
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || 'Failed to generate poll');
			}
			location.reload();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			submitting = false;
		}
	}

	async function vote(optionIndex: number) {
		voting = true;
		try {
			const res = await fetch('/schedule/api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'vote',
					request_id: data.request.id,
					option_index: optionIndex
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
			myVote = optionIndex;
			setTimeout(() => location.reload(), 400);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			voting = false;
		}
	}

	function formatRange(opt: PollOption): string {
		const startFmt = formatSlotInTz(opt.start, tz);
		const endTime = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(new Date(opt.end));
		return `${startFmt} – ${endTime}`;
	}

	async function pickTime(opt: PollOption) {
		const params = new URLSearchParams({
			schedule_title: data.request.title,
			starts_at: opt.start,
			ends_at: opt.end,
			timezone: tz,
			schedule_id: data.request.id
		});
		goto(`/create?${params.toString()}`);
	}

	async function deleteIntent() {
		if (!confirm('Delete? This cannot be undone.')) return;
		await fetch('/schedule/api', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'delete',
				request_id: data.request.id
			})
		});
		goto('/schedule');
	}

	function getVoteCount(idx: number): number {
		return data.votes.find((v) => v.option_index === idx)?.count ?? 0;
	}

	function totalVotes(): number {
		return data.votes.reduce((sum, v) => sum + v.count, 0);
	}
</script>

<svelte:head>
	<title>{data.request.title} — Find a Time</title>
	<meta name="description" content="Mark your availability for: {data.request.title}" />
	<meta property="og:title" content="{data.request.title} — Find a Time" />
	<meta property="og:description" content="Mark your availability and help find the best time to meet." />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{data.request.title} — Find a Time" />
	<meta name="twitter:description" content="Mark your availability and help find the best time to meet." />
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">
				{data.request.title}
			</h1>
			<p class="text-base-500 dark:text-base-400 mt-1 text-sm">
				{#if data.request.status === 'collecting'}
					Mark when you're available, then save.
				{:else if data.request.status === 'polling'}
					Vote for the time that works best.
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.request.status === 'collecting' && data.isLoggedIn}
				<Button onclick={saveAvailability} disabled={submitting}>
					{#if submitting}
						Saving...
					{:else if saved}
						Saved!
					{:else}
						Save Availability
					{/if}
				</Button>
			{:else if !data.isLoggedIn}
				<Button onclick={() => atProtoLoginModalState.show()}>
					Login to respond
				</Button>
			{/if}
			<Button variant="secondary" onclick={copyLink}>
				{copied ? 'Copied!' : 'Copy Link'}
			</Button>
		</div>
	</div>

	<div class="grid gap-8 lg:grid-cols-[1fr_18rem]">
		<div>
			<AvailabilityGrid
				allSlots={data.allSlots}
				selectedSlots={mySlots}
				heatmap={data.heatmap}
				participantCount={data.participantCount}
				organizerTz={data.request.organizer_tz}
				readonly={!data.isLoggedIn || data.request.status !== 'collecting'}
				{highlightSlots}
				onchange={(slots) => {
					mySlots = slots;
					saved = false;
				}}
			/>

			{#if saved}
				<p class="mt-2 text-sm text-green-600 dark:text-green-400">Saved.</p>
			{/if}
		</div>

			<!-- sidebar: participants + preview + generate poll -->
			<div>
				<h2 class="text-base-900 dark:text-base-50 mb-3 text-lg font-semibold">
					{data.participantCount} response{data.participantCount === 1 ? '' : 's'}
				</h2>

				{#if data.participants.length > 0}
					<div class="mb-4 flex flex-wrap -space-x-3">
						{#each data.participants as p (p.did)}
							<button
								type="button"
								class="transition-opacity {hoveredDid && hoveredDid !== p.did ? 'opacity-30' : ''}"
								onpointerenter={() => (hoveredDid = p.did)}
								onpointerleave={() => (hoveredDid = null)}
								title={p.displayName || p.handle}
							>
								<FoxAvatar
									src={p.avatar?.replace('/avatar/', '/avatar_thumbnail/')}
									alt={p.displayName || p.handle || p.did}
									class="border-base-100 dark:border-base-900 size-10 border-2"
								/>
							</button>
						{/each}
					</div>
				{/if}

				{#if data.request.status === 'collecting'}
					<!-- unlocked: show overlaps as preview -->
					{#if data.previewCandidates.length > 0}
						<p class="text-base-500 dark:text-base-400 mb-2 text-xs">
							Best overlaps ({tzAbbr})
						</p>
						<div class="space-y-2">
							{#each data.previewCandidates as c}
								<div
									class="border-base-200 dark:border-base-800 cursor-pointer rounded-lg border p-3 text-sm transition-colors hover:border-accent-500 dark:hover:border-accent-400"
									role="button"
									tabindex="0"
									onpointerenter={() => (hoveredOption = c)}
									onpointerleave={() => (hoveredOption = null)}
								>
									<span class="text-base-900 dark:text-base-50">{formatRange(c)}</span>
									<span class="text-base-500 ml-2 text-xs">{c.count} available</span>
								</div>
							{/each}
						</div>
					{:else if data.participantCount >= 2}
						<p class="text-base-500 dark:text-base-400 text-xs">
							No overlapping times yet.
						</p>
					{/if}

					{#if data.isOrganizer && data.participantCount > 0 && data.previewCandidates.length > 0}
						<Button
							class="mt-4 w-full"
							onclick={lockAvailability}
							disabled={submitting}
						>
							{submitting ? 'Locking...' : 'Lock & Vote'}
						</Button>
						<p class="text-base-500 mt-1 text-xs">
							Freezes availability so everyone can vote.
						</p>
					{/if}
				{:else if data.request.status === 'polling'}
					<!-- locked: overlaps are votable -->
					<p class="text-base-500 dark:text-base-400 mb-2 text-xs">
						Pick the best time ({tzAbbr})
					</p>
					<div class="space-y-2">
						{#each data.pollOptions as opt, idx}
							{@const votes = getVoteCount(idx)}
							{@const isMyVote = myVote === idx}
							<button
								type="button"
								class="w-full rounded-lg border p-3 text-left text-sm transition-colors
									{isMyVote
									? 'border-accent-500 bg-accent-500/10 dark:border-accent-400'
									: 'border-base-200 dark:border-base-800 hover:border-base-400 dark:hover:border-base-600'}"
								onclick={() => vote(idx)}
								onpointerenter={() => (hoveredOption = opt)}
								onpointerleave={() => (hoveredOption = null)}
								disabled={voting || !data.isLoggedIn}
							>
								<span class="text-base-900 dark:text-base-50">{formatRange(opt)}</span>
								<span class="text-base-500 ml-1 text-xs">
									{votes} vote{votes === 1 ? '' : 's'}
									{#if isMyVote}
										<span class="text-accent-500">✓</span>
									{/if}
								</span>
							</button>
						{/each}

						<!-- none of these work -->
						<button
							type="button"
							class="w-full rounded-lg border p-3 text-left text-sm transition-colors
								{myVote === -1
								? 'border-red-500 bg-red-500/10 dark:border-red-400'
								: 'border-base-200 dark:border-base-800 hover:border-base-400 dark:hover:border-base-600'}"
							onclick={() => vote(-1)}
							disabled={voting || !data.isLoggedIn}
						>
							<span class="text-base-900 dark:text-base-50">None of these work</span>
							{#if getVoteCount(-1) > 0}
								<span class="text-base-500 ml-1 text-xs">{getVoteCount(-1)}</span>
							{/if}
						</button>
					</div>

					<!-- organizer: finalize -->
					{#if data.isOrganizer && totalVotes() > 0}
						<div class="mt-4">
							<p class="text-base-500 dark:text-base-400 mb-2 text-xs">Create event from winner</p>
							{#each data.pollOptions as opt, idx}
								{@const votes = getVoteCount(idx)}
								{#if votes > 0}
									<Button
										class="mb-2 w-full"
										variant="secondary"
										onclick={() => pickTime(opt)}
									>
										{formatRange(opt)}
									</Button>
								{/if}
							{/each}
						</div>
					{/if}

				{:else if data.request.status === 'resolved'}
					<!-- event created -->
					<div class="space-y-3">
						<p class="text-green-500 text-sm font-medium">Event created</p>
						{#if data.request.event_uri}
							<Button href={data.request.event_uri} class="w-full">
								View Event
							</Button>
						{/if}
					</div>
				{/if}
			{#if data.isOrganizer}
					<div class="mt-8 border-t border-base-200 pt-4 dark:border-base-800">
						<button
							type="button"
							class="text-xs text-red-500 hover:text-red-400 transition-colors"
							onclick={deleteIntent}
						>
							Delete
						</button>
					</div>
				{/if}
			</div>
		</div>
</div>
