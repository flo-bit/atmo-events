<script lang="ts">
	import type { AttendeeInfo } from '$lib/contrail';
	import { Avatar as FoxAvatar } from '@foxui/core';
	import { scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { Modal } from '@foxui/core';

	let {
		going = [],
		interested = [],
		goingCount: initialGoingCount = going.length,
		interestedCount: initialInterestedCount = interested.length
	}: {
		going?: AttendeeInfo[];
		interested?: AttendeeInfo[];
		goingCount?: number;
		interestedCount?: number;
	} = $props();

	let goingCountOverride: number | null = $state(null);
	let interestedCountOverride: number | null = $state(null);
	let goingAttendeesOverride: AttendeeInfo[] | null = $state(null);
	let interestedAttendeesOverride: AttendeeInfo[] | null = $state(null);

	let modalOpen = $state(false);
	let modalGroup: 'going' | 'interested' = $state('going');

	const MAX_AVATARS = 18;

	let goingCount = $derived(goingCountOverride ?? initialGoingCount);
	let interestedCount = $derived(interestedCountOverride ?? initialInterestedCount);
	let goingAttendees = $derived(goingAttendeesOverride ?? going);
	let interestedAttendees = $derived(interestedAttendeesOverride ?? interested);

	let totalCount = $derived(goingCount + interestedCount);

	let goingDisplay = $derived(goingAttendees.slice(0, MAX_AVATARS));
	let goingOverflow = $derived(goingCount - goingDisplay.length);

	let interestedDisplay = $derived(interestedAttendees.slice(0, MAX_AVATARS));
	let interestedOverflow = $derived(interestedCount - interestedDisplay.length);

	let modalAttendees = $derived(modalGroup === 'going' ? goingAttendees : interestedAttendees);
	let modalTitle = $derived(modalGroup === 'going' ? 'Going' : 'Interested');

	function openModal(group: 'going' | 'interested') {
		modalGroup = group;
		modalOpen = true;
	}

	export function addAttendee(attendee: AttendeeInfo) {
		const nextGoing = goingAttendees.filter((a) => a.did !== attendee.did);
		const nextInterested = interestedAttendees.filter((a) => a.did !== attendee.did);

		// Remove from both lists first (in case of status change)
		if (attendee.status === 'going') {
			goingAttendeesOverride = [attendee, ...nextGoing];
			interestedAttendeesOverride = nextInterested;
			goingCountOverride = goingAttendeesOverride.length;
			interestedCountOverride = interestedAttendeesOverride.length;
		} else if (attendee.status === 'interested') {
			goingAttendeesOverride = nextGoing;
			interestedAttendeesOverride = [attendee, ...nextInterested];
			goingCountOverride = goingAttendeesOverride.length;
			interestedCountOverride = interestedAttendeesOverride.length;
		}
	}

	function thumbnail(url: string | undefined) {
		return url?.replace('/avatar/', '/avatar_thumbnail/');
	}

	export function removeAttendee(did: string) {
		const wasGoing = goingAttendees.some((a) => a.did === did);
		const wasInterested = interestedAttendees.some((a) => a.did === did);
		goingAttendeesOverride = goingAttendees.filter((a) => a.did !== did);
		interestedAttendeesOverride = interestedAttendees.filter((a) => a.did !== did);
		if (wasGoing) goingCountOverride = goingAttendeesOverride.length;
		if (wasInterested) interestedCountOverride = interestedAttendeesOverride.length;
	}
</script>

{#if totalCount > 0}
	<div class="mb-2">
		{#if goingCount > 0}
			<button
				type="button"
				class="hover:bg-base-100 dark:hover:bg-base-800/50 -mx-2 block w-full cursor-pointer rounded-xl px-2 py-2 text-left transition-colors"
				onclick={() => openModal('going')}
			>
				<p class="text-base-900 dark:text-base-50 mb-2 text-sm">
					<span class="font-bold">{goingCount}</span>
					<span
						class="text-base-500 dark:text-base-400 text-xs font-semibold tracking-wider uppercase"
						>Going</span
					>
				</p>
				<div class="flex items-center">
					<div class="flex flex-wrap -space-y-2 -space-x-4 pr-4">
						{#each goingDisplay as person (person.did)}
							<div
								animate:flip={{ duration: 300 }}
								in:scale={{ duration: 300, start: 0.5 }}
								out:scale={{ duration: 200, start: 0.5 }}
							>
								<FoxAvatar
									src={thumbnail(person.avatar)}
									alt={person.name}
									class="border-base-100 dark:border-base-900 size-12 border-2"
								/>
							</div>
						{/each}
						{#if goingOverflow > 0}
							<span
								class="bg-base-200 dark:bg-base-800 text-base-950 dark:text-base-100 border-base-100 dark:border-base-900 z-10 inline-flex size-12 items-center justify-center rounded-full border-2 text-sm font-semibold"
							>
								+{goingOverflow}
							</span>
						{/if}
					</div>
				</div>
			</button>
		{/if}

		{#if interestedCount > 0}
			<button
				type="button"
				class="hover:bg-base-100 dark:hover:bg-base-800/50 -mx-2 mt-4 block w-full cursor-pointer rounded-xl px-2 py-2 text-left transition-colors"
				onclick={() => openModal('interested')}
			>
				<p class="text-base-900 dark:text-base-50 mb-2 text-sm">
					<span class="font-bold">{interestedCount}</span>
					<span
						class="text-base-500 dark:text-base-400 text-xs font-semibold tracking-wider uppercase"
						>Interested</span
					>
				</p>
				<div class="flex items-center">
					<div class="flex flex-wrap -space-y-2 -space-x-4 pr-4">
						{#each interestedDisplay as person (person.did)}
							<div
								animate:flip={{ duration: 300 }}
								in:scale={{ duration: 300, start: 0.5 }}
								out:scale={{ duration: 200, start: 0.5 }}
							>
								<FoxAvatar
									src={thumbnail(person.avatar)}
									alt={person.name}
									class="border-base-100 dark:border-base-900 size-12 border-2"
								/>
							</div>
						{/each}
						{#if interestedOverflow > 0}
							<span
								class="bg-base-200 dark:bg-base-800 text-base-950 dark:text-base-100 border-base-100 dark:border-base-900 z-10 inline-flex size-12 items-center justify-center rounded-full border-2 text-sm font-semibold"
							>
								+{interestedOverflow}
							</span>
						{/if}
					</div>
				</div>
			</button>
		{/if}
	</div>
{/if}

<Modal
	bind:open={modalOpen}
	closeButton
	onOpenAutoFocus={(e: Event) => e.preventDefault()}
	class="p-0"
>
	<p class="text-base-900 dark:text-base-50 px-4 pt-4 text-lg font-semibold">
		{modalTitle}
		<span class="text-base-500 dark:text-base-400 text-sm font-normal">
			({modalAttendees.length})
		</span>
	</p>
	<div
		class="dark:bg-base-900/50 bg-base-200/30 mx-4 mb-4 max-h-80 space-y-1 overflow-y-auto rounded-xl p-2"
	>
		{#each modalAttendees as person (person.did)}
			<a
				href={person.url}
				target={person.url?.startsWith('/') ? undefined : '_blank'}
				rel={person.url?.startsWith('/') ? undefined : 'noopener noreferrer'}
				class="hover:bg-base-200 dark:hover:bg-base-900 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
			>
				<FoxAvatar src={thumbnail(person.avatar)} alt={person.name} class="size-10 shrink-0" />
				<div class="min-w-0">
					<p class="text-base-900 dark:text-base-50 truncate text-sm font-medium">
						{person.name}
					</p>
					{#if person.handle}
						<p class="text-base-500 dark:text-base-400 truncate text-xs">
							@{person.handle}
						</p>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</Modal>
