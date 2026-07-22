<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { EventEditor, type EventTicketSetupLauncher } from '@atmo-dev/events-ui';
	import { Button } from '@foxui/core';
	import { onMount } from 'svelte';
	import {
		completeOrganizerTicketSetup,
		startOrganizerTicketSetup,
		syncOrganizerTicketEvent
	} from '$lib/atm/organizer.remote';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));
	let eventUri = $derived(`at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`);
	let ticketSetup = $derived.by((): EventTicketSetupLauncher | null => {
		const needsTicketSync = data.atmTicketSyncState !== 'unticketed';
		if (!data.atmTicketCreationEnabled && !needsTicketSync) return null;
		return {
			providerName: 'Atmosphere Tickets',
			iconUrl: data.atmTicketIconUrl ?? undefined,
			start: async ({ eventUri: uri }) => startOrganizerTicketSetup({ eventUri: uri }),
			...(data.atmTicketSyncState !== 'unticketed'
				? {
						syncAfterSave: async ({ eventUri: uri, eventCid }) => {
							if (!eventCid) {
								throw new Error('The PDS did not return a CID for the saved event.');
							}
							await syncOrganizerTicketEvent({
								eventUri: uri,
								eventCid,
								expectTicketEvent: data.atmTicketSyncState === 'ticketed'
							});
						}
					}
				: {})
		};
	});
	let setupMode = $derived(
		data.atmTicketCreationEnabled ? page.url.searchParams.get('atmTicketSetup') : null
	);
	let setupBusy = $state(false);
	let setupError = $state<string | null>(null);

	function errorMessage(cause: unknown): string {
		if (cause && typeof cause === 'object') {
			const body = (cause as { body?: { message?: string } }).body;
			if (body?.message) return body.message;
			const message = (cause as { message?: string }).message;
			if (message) return message;
		}
		return 'Ticket setup could not be completed. Your hidden event draft is safe.';
	}

	async function continueTicketSetup() {
		setupBusy = true;
		setupError = null;
		try {
			if (setupMode === 'complete') {
				const result = await completeOrganizerTicketSetup({ eventUri });
				await adapter.notifyUpdate?.(result.uri);
				await goto(
					resolve('/(app)/p/[actor]/e/[rkey]?created=true&tickets=configured', {
						actor: data.actorDid,
						rkey: data.rkey
					}),
					{
						replaceState: true,
						invalidateAll: true
					}
				);
				return;
			}

			const handoff = await startOrganizerTicketSetup({ eventUri });
			window.location.replace(handoff.url);
		} catch (cause) {
			setupError = errorMessage(cause);
			setupBusy = false;
		}
	}

	onMount(() => {
		if (setupMode === 'resume' || setupMode === 'complete') void continueTicketSetup();
	});
</script>

<svelte:head>
	<title>Edit Event</title>
</svelte:head>

{#if setupMode === 'resume' || setupMode === 'complete'}
	<div class="px-6 py-20">
		<div
			class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950 mx-auto max-w-lg rounded-3xl border p-8 text-center shadow-sm"
		>
			{#if data.atmTicketIconUrl}
				<img src={data.atmTicketIconUrl} alt="" class="mx-auto mb-4 size-10" aria-hidden="true" />
			{/if}
			<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">
				{setupMode === 'complete' ? 'Publishing your ticketed event' : 'Opening ticket setup'}
			</h1>
			<p class="text-base-500 dark:text-base-400 mt-2 text-sm leading-6">
				{#if setupMode === 'complete'}
					We’re confirming your ticket types, then making the event visible in Explore.
				{:else}
					We’re reconnecting this hidden event draft to its Atmosphere Tickets workspace.
				{/if}
			</p>
			{#if setupBusy}
				<div class="mt-6" role="status" aria-live="polite">Please wait…</div>
			{:else if setupError}
				<p class="mt-6 text-sm text-red-600 dark:text-red-400" role="alert">{setupError}</p>
				<div class="mt-5 flex justify-center gap-3">
					<Button onclick={continueTicketSetup}>Try again</Button>
					<Button
						variant="secondary"
						onclick={() =>
							goto(
								resolve('/(app)/p/[actor]/e/[rkey]/edit', {
									actor: data.actorDid,
									rkey: data.rkey
								}),
								{ replaceState: true }
							)}>Edit hidden draft</Button
					>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<EventEditor
		eventData={data.eventData}
		actorDid={data.actorDid}
		rkey={data.rkey}
		{adapter}
		{viewer}
		{ticketSetup}
	/>
{/if}
