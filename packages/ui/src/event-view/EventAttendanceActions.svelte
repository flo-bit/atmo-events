<script lang="ts">
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';
	import EventRsvp from '../EventRsvp.svelte';
	import ExternalRsvpNotice from './ExternalRsvpNotice.svelte';
	import GetTicketsNotice from './GetTicketsNotice.svelte';
	import {
		isAtmosphereTicketsUrlForEvent,
		type TicketActionState,
		type TicketDiscoveryState
	} from './tickets.js';

	let {
		ticketUrl,
		ticketAdmissionRequired = false,
		ticketActionState = 'open',
		ticketDiscoveryState = 'none',
		showRsvpPanel,
		rsvpExternalOnly = false,
		externalSourceUrl,
		eventUri,
		eventCid = null,
		initialRsvpStatus = null,
		initialRsvpRkey = null,
		spaceUri = null,
		adapter,
		viewer,
		onrsvp,
		oncancel
	}: {
		ticketUrl?: string;
		/** Explicit admission policy; never inferred from ticketUrl discovery. */
		ticketAdmissionRequired?: boolean;
		/** Whether ticket actions are open, closed, or unsafe to infer from public dates. */
		ticketActionState?: TicketActionState;
		/** Whether protocol discovery found a page, found none, or could not complete. */
		ticketDiscoveryState?: TicketDiscoveryState;
		showRsvpPanel: boolean;
		rsvpExternalOnly?: boolean;
		externalSourceUrl?: string;
		eventUri: string;
		eventCid?: string | null;
		initialRsvpStatus?: 'going' | 'interested' | 'notgoing' | null;
		initialRsvpRkey?: string | null;
		spaceUri?: string | null;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		onrsvp?: (status: 'going' | 'interested', rkey: string) => void;
		oncancel?: () => void;
	} = $props();

	let ticketActionOpen = $derived(ticketActionState === 'open');
	let effectiveTicketRequired = $derived(
		ticketAdmissionRequired && ticketActionState !== 'unknown' && ticketDiscoveryState !== 'none'
	);
	let hasTicketCta = $derived(
		ticketActionOpen &&
			ticketDiscoveryState === 'found' &&
			isAtmosphereTicketsUrlForEvent(ticketUrl, eventUri)
	);
	let attendanceClosed = $derived(effectiveTicketRequired && ticketActionState === 'closed');
	let ticketUnavailable = $derived(
		ticketActionOpen &&
			effectiveTicketRequired &&
			(ticketDiscoveryState === 'unavailable' ||
				(ticketDiscoveryState === 'found' && !hasTicketCta))
	);
	let combineTicketAndRsvp = $derived(
		effectiveTicketRequired &&
			ticketActionOpen &&
			showRsvpPanel &&
			viewer.isLoggedIn &&
			!rsvpExternalOnly
	);
</script>

{#if attendanceClosed}
	{#if showRsvpPanel}
		{#if rsvpExternalOnly && externalSourceUrl}
			<ExternalRsvpNotice url={externalSourceUrl} />
		{:else if viewer.isLoggedIn && initialRsvpStatus}
			<EventRsvp
				{eventUri}
				{eventCid}
				{initialRsvpStatus}
				{initialRsvpRkey}
				{spaceUri}
				ticketRequired={false}
				allowGoing={false}
				allowResponses={false}
				{adapter}
				{viewer}
				{onrsvp}
				{oncancel}
			/>
		{/if}
	{/if}
{:else}
	{#if ticketUrl && hasTicketCta && !combineTicketAndRsvp}
		<GetTicketsNotice url={ticketUrl} {eventUri} />
	{:else if ticketUnavailable && !combineTicketAndRsvp}
		<GetTicketsNotice {eventUri} unavailable={true} />
	{/if}

	{#if showRsvpPanel}
		{#if rsvpExternalOnly && externalSourceUrl}
			<ExternalRsvpNotice url={externalSourceUrl} />
		{:else}
			<EventRsvp
				{eventUri}
				{eventCid}
				{initialRsvpStatus}
				{initialRsvpRkey}
				{spaceUri}
				ticketUrl={combineTicketAndRsvp ? ticketUrl : undefined}
				ticketRequired={effectiveTicketRequired}
				allowGoing={!effectiveTicketRequired}
				{adapter}
				{viewer}
				{onrsvp}
				{oncancel}
			/>
		{/if}
	{/if}
{/if}
