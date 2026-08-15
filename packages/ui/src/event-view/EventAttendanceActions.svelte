<script lang="ts">
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';
	import EventRsvp from '../EventRsvp.svelte';
	import ExternalRsvpNotice from './ExternalRsvpNotice.svelte';
	import GetTicketsNotice from './GetTicketsNotice.svelte';
	import { isAtmosphereTicketsUrlForEvent, type TicketActionState } from './tickets.js';

	let {
		ticketUrl,
		ticketAdmissionRequired = false,
		ticketActionState = 'open',
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
		ticketAdmissionRequired && ticketActionState !== 'unknown'
	);
	let hasTicketCta = $derived(
		ticketActionOpen && isAtmosphereTicketsUrlForEvent(ticketUrl, eventUri)
	);
	let attendanceClosed = $derived(effectiveTicketRequired && ticketActionState === 'closed');
	let ticketUnavailable = $derived(ticketActionOpen && effectiveTicketRequired && !hasTicketCta);
	let combineTicketAndRsvp = $derived(
		effectiveTicketRequired && ticketActionOpen && showRsvpPanel && viewer.isLoggedIn
	);
</script>

{#if !attendanceClosed}
	{#if ticketUrl && hasTicketCta && !combineTicketAndRsvp}
		<GetTicketsNotice url={ticketUrl} {eventUri} />
	{:else if ticketUnavailable && !combineTicketAndRsvp}
		<GetTicketsNotice {eventUri} unavailable={true} />
	{/if}

	{#if showRsvpPanel}
		{#if rsvpExternalOnly && externalSourceUrl && !effectiveTicketRequired}
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
