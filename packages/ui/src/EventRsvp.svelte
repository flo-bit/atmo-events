<script lang="ts">
	import * as TID from '@atcute/tid';
	import { Avatar, Badge, Button } from '@foxui/core';
	import { launchConfetti } from '@foxui/visual';
	import { onDestroy } from 'svelte';
	import type { EditorAdapter, EditorViewer } from './editor/adapter.js';
	import { formatTicketPrice, type EventTicketingView } from './event-view/tickets.js';

	let {
		eventUri,
		eventCid,
		initialRsvpStatus = null,
		initialRsvpRkey = null,
		spaceUri = null,
		adapter,
		viewer,
		ticketing = null,
		hostName = '',
		autoRsvpGoing = false,
		autoRsvpRkey = null,
		onrsvp,
		oncancel,
		onlogin,
		onbuytickets,
		onAutoRsvpComplete
	}: {
		eventUri: string;
		eventCid: string | null;
		initialRsvpStatus?: 'going' | 'interested' | 'notgoing' | null;
		initialRsvpRkey?: string | null;
		/** If set, RSVPs write into this space instead of the user's public PDS. */
		spaceUri?: string | null;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		/** Ticket availability folds into the same attendance card when configured. */
		ticketing?: EventTicketingView | null;
		hostName?: string;
		/** One-shot signal used after a verified ticket purchase. */
		autoRsvpGoing?: boolean;
		/** Deterministic key supplied by the signed purchase intent. */
		autoRsvpRkey?: string | null;
		onrsvp?: (status: 'going' | 'interested', rkey: string) => void;
		oncancel?: () => void;
		onlogin?: () => void;
		onbuytickets?: () => void;
		onAutoRsvpComplete?: () => void;
	} = $props();

	let rsvpStatusOverride: 'going' | 'interested' | 'notgoing' | null | undefined =
		$state(undefined);
	let rsvpRkeyOverride: string | null | undefined = $state(undefined);
	let rsvpSubmitting = $state(false);
	let automaticRsvpHandled = $state(false);
	let automaticRsvpAttempts = $state(0);
	let automaticRsvpRetry: ReturnType<typeof setTimeout> | undefined;
	let ticketIconFailed = $state(false);

	let rsvpStatus = $derived(
		rsvpStatusOverride !== undefined ? rsvpStatusOverride : initialRsvpStatus
	);
	let rsvpRkey = $derived(rsvpRkeyOverride !== undefined ? rsvpRkeyOverride : initialRsvpRkey);
	let ticketGated = $derived(!!ticketing && ticketing.tiers.length > 0);
	let activeViewerTickets = $derived(
		ticketing?.viewerTickets.filter((ticket) => ticket.status === 'active') ?? []
	);
	let hasPaidTickets = $derived(
		ticketing?.tiers.some((tier) => (tier.unitAmount ?? 0) > 0) ?? false
	);
	let hasAvailableTickets = $derived(
		ticketing?.tiers.some((tier) => tier.status === 'available' && tier.availableQuantity > 0) ??
			false
	);
	let lowestTicket = $derived.by(() => {
		if (!ticketing) return null;
		const visible = ticketing.tiers.filter((tier) => tier.status !== 'hidden');
		if (visible.length === 0) return null;
		const available = visible.filter(
			(tier) => tier.status === 'available' && tier.availableQuantity > 0
		);
		return [...(available.length > 0 ? available : visible)].sort(
			(a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0)
		)[0];
	});
	let ticketPriceLabel = $derived(
		lowestTicket
			? `Tickets from ${formatTicketPrice(lowestTicket.unitAmount, lowestTicket.currency)}`
			: 'View ticket availability'
	);
	let ticketActionLabel = $derived(
		activeViewerTickets.length > 0 || !hasAvailableTickets ? 'View tickets' : 'Buy tickets'
	);

	function requestLogin() {
		onlogin?.();
		adapter.requestLogin();
	}

	function submitInterested() {
		if (!viewer.isLoggedIn) {
			requestLogin();
			return;
		}
		void submitRsvp('interested');
	}

	async function submitRsvp(status: 'going' | 'interested', automatic = false): Promise<boolean> {
		if (!viewer.isLoggedIn || !viewer.did) return false;
		rsvpSubmitting = true;
		try {
			const key = rsvpRkey ?? (automatic ? autoRsvpRkey : null) ?? TID.now();
			const record = {
				$type: 'community.lexicon.calendar.rsvp',
				createdWith: 'https://atmo.rsvp',
				status: `community.lexicon.calendar.rsvp#${status}`,
				subject: {
					uri: eventUri,
					...(eventCid ? { cid: eventCid } : {})
				},
				createdAt: new Date().toISOString()
			};

			let ok = false;
			if (spaceUri) {
				if (!adapter.putSpaceRecord) {
					console.error('putSpaceRecord not supported by this adapter');
					return false;
				}
				const result = await adapter.putSpaceRecord({
					spaceUri,
					collection: 'community.lexicon.calendar.rsvp',
					rkey: key,
					record
				});
				ok = result.ok;
			} else {
				try {
					await adapter.putRecord({
						collection: 'community.lexicon.calendar.rsvp',
						rkey: key,
						record
					});
					ok = true;
					adapter.notifyUpdate?.(`at://${viewer.did}/community.lexicon.calendar.rsvp/${key}`);
				} catch (e) {
					console.error('RSVP putRecord failed:', e);
				}
			}

			if (ok) {
				rsvpStatusOverride = status;
				rsvpRkeyOverride = key;
				launchConfetti();
				onrsvp?.(status, key);
				if (!automatic && autoRsvpGoing) onAutoRsvpComplete?.();
			}
			return ok;
		} catch (e) {
			console.error('Failed to submit RSVP:', e);
			return false;
		} finally {
			rsvpSubmitting = false;
		}
	}

	$effect(() => {
		if (!autoRsvpGoing) {
			automaticRsvpHandled = false;
			automaticRsvpAttempts = 0;
			if (automaticRsvpRetry) clearTimeout(automaticRsvpRetry);
			return;
		}
		if (automaticRsvpHandled || rsvpSubmitting || !viewer.isLoggedIn || !viewer.did) {
			return;
		}
		automaticRsvpHandled = true;
		if (rsvpStatus === 'going') {
			onAutoRsvpComplete?.();
			return;
		}
		automaticRsvpAttempts += 1;
		void submitRsvp('going', true).then((ok) => {
			if (ok) {
				onAutoRsvpComplete?.();
				return;
			}
			if (autoRsvpGoing && automaticRsvpAttempts < 3) {
				automaticRsvpRetry = setTimeout(() => {
					automaticRsvpHandled = false;
				}, automaticRsvpAttempts * 1_000);
			} else {
				console.warn('Automatic RSVP failed; leaving the manual RSVP controls available.');
			}
		});
	});

	onDestroy(() => {
		if (automaticRsvpRetry) clearTimeout(automaticRsvpRetry);
	});

	async function cancelRsvp() {
		if (!viewer.isLoggedIn || !viewer.did || !rsvpRkey) return;
		rsvpSubmitting = true;
		try {
			if (spaceUri) {
				if (!adapter.deleteSpaceRecord) {
					console.error('deleteSpaceRecord not supported by this adapter');
					return;
				}
				await adapter.deleteSpaceRecord({
					spaceUri,
					collection: 'community.lexicon.calendar.rsvp',
					rkey: rsvpRkey
				});
			} else {
				await adapter.deleteRecord({
					collection: 'community.lexicon.calendar.rsvp',
					rkey: rsvpRkey
				});
				adapter.notifyUpdate?.(`at://${viewer.did}/community.lexicon.calendar.rsvp/${rsvpRkey}`);
			}
			rsvpStatusOverride = null;
			rsvpRkeyOverride = null;
			oncancel?.();
		} catch (e) {
			console.error('Failed to cancel RSVP:', e);
		} finally {
			rsvpSubmitting = false;
		}
	}
</script>

{#if ticketGated && ticketing}
	<div
		class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 rounded-2xl border p-4"
	>
		{#if !viewer.isLoggedIn}
			<div>
				<p class="text-base-900 dark:text-base-50 font-semibold">Tickets available</p>
				<p class="text-base-500 dark:text-base-400 mt-0.5 text-sm">
					Buy as a guest, or log in to save your tickets and RSVP.
				</p>
			</div>
		{:else if rsvpStatus === 'going'}
			<div class="flex items-center justify-between gap-4">
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
					>
						<svg
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-green-600 dark:text-green-400"
						>
							<path
								fill-rule="evenodd"
								d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 truncate font-semibold">You're Going</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else if rsvpStatus === 'interested'}
			<div class="flex items-center justify-between gap-4">
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
					>
						<svg
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-amber-600 dark:text-amber-400"
						>
							<path
								fill-rule="evenodd"
								d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 truncate font-semibold">You're Interested</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else if rsvpStatus === 'notgoing'}
			<div class="flex items-center justify-between gap-4">
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
					>
						<svg
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-red-600 dark:text-red-400"
						>
							<path
								d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 truncate font-semibold">Not Going</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else}
			<div class="flex min-w-0 items-center gap-2">
				<span class="text-base-500 dark:text-base-400 shrink-0 text-sm">Attend as</span>
				<Avatar
					src={viewer.avatar}
					alt={viewer.displayName || viewer.handle || viewer.did || ''}
					class="size-5 shrink-0"
				/>
				<span class="text-base-700 dark:text-base-300 truncate text-sm font-medium">
					{viewer.displayName || viewer.handle || viewer.did}
				</span>
			</div>
		{/if}

		<div class="mt-4 flex gap-3">
			<Button onclick={onbuytickets} class="flex-1">
				{#if ticketing.iconUrl && !ticketIconFailed}
					<img
						src={ticketing.iconUrl}
						alt=""
						class="size-4 shrink-0 object-contain brightness-0 invert"
						onerror={() => (ticketIconFailed = true)}
					/>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" class="size-4 shrink-0" aria-hidden="true">
						<path
							d="M5.5 7.25h13a1.75 1.75 0 0 1 1.75 1.75v1a2.25 2.25 0 0 0 0 4v1A1.75 1.75 0 0 1 18.5 16.75h-13A1.75 1.75 0 0 1 3.75 15v-1a2.25 2.25 0 0 0 0-4V9A1.75 1.75 0 0 1 5.5 7.25Z"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path d="M9 7.5v9" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" />
					</svg>
				{/if}
				{ticketActionLabel}
			</Button>
			{#if rsvpStatus !== 'going' && rsvpStatus !== 'interested'}
				<Button
					onclick={submitInterested}
					disabled={rsvpSubmitting}
					variant="secondary"
					class="flex-1"
				>
					{rsvpSubmitting ? '...' : 'Interested'}
				</Button>
			{/if}
		</div>

		<div
			class="border-base-200 dark:border-base-800 text-base-500 dark:text-base-400 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs"
		>
			<span class="text-base-700 dark:text-base-300">{ticketPriceLabel}</span>
			{#if ticketing.environment === 'test'}
				<Badge size="sm" variant="secondary">Test mode</Badge>
			{/if}
			{#if hasPaidTickets}
				<span class="basis-full">Payments go directly to {hostName}.</span>
			{/if}
		</div>
	</div>
{:else}
	<div
		class="border-base-200 dark:border-base-800 bg-base-100 items-between dark:bg-base-950/50 mt-8 mb-2 flex h-25 flex-col justify-center rounded-2xl border p-4"
	>
		{#if !viewer.isLoggedIn}
			<div class="flex items-center justify-between gap-4">
				<p class="text-base-600 dark:text-base-400 text-sm">Log in to RSVP to this event</p>

				<Button onclick={requestLogin}>Log in to RSVP</Button>
			</div>
		{:else if rsvpStatus === 'going'}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div
						class="flex size-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-green-600 dark:text-green-400"
						>
							<path
								fill-rule="evenodd"
								d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 font-semibold">You're Going</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else if rsvpStatus === 'interested'}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div
						class="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-amber-600 dark:text-amber-400"
						>
							<path
								fill-rule="evenodd"
								d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 font-semibold">You're Interested</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else if rsvpStatus === 'notgoing'}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div
						class="flex size-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-red-600 dark:text-red-400"
						>
							<path
								d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
							/>
						</svg>
					</div>
					<p class="text-base-900 dark:text-base-50 font-semibold">Not Going</p>
				</div>
				<Button onclick={cancelRsvp} disabled={rsvpSubmitting} variant="ghost">Remove</Button>
			</div>
		{:else}
			{#if viewer.isLoggedIn}
				<div class="mb-4 flex items-center gap-2">
					<span class="text-base-500 dark:text-base-400 text-sm">Attend as</span>
					<Avatar
						src={viewer.avatar}
						alt={viewer.displayName || viewer.handle || viewer.did || ''}
						class="size-5"
					/>
					<span class="text-base-700 dark:text-base-300 truncate text-sm font-medium">
						{viewer.displayName || viewer.handle || viewer.did}
					</span>
				</div>
			{/if}
			<div class="flex gap-3">
				<Button onclick={() => submitRsvp('going')} disabled={rsvpSubmitting} class="flex-1">
					{rsvpSubmitting ? '...' : 'Going'}
				</Button>
				<Button
					onclick={() => submitRsvp('interested')}
					disabled={rsvpSubmitting}
					variant="secondary"
					class="flex-1"
				>
					{rsvpSubmitting ? '...' : 'Interested'}
				</Button>
			</div>
		{/if}
	</div>
{/if}
