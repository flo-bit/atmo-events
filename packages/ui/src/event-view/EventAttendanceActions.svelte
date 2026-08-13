<script lang="ts">
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';
	import EventRsvp from '../EventRsvp.svelte';
	import ExternalRsvpNotice from './ExternalRsvpNotice.svelte';
	import GetTicketsNotice from './GetTicketsNotice.svelte';
	import { isAtmosphereTicketsUrlForEvent } from './tickets.js';

	let {
		ticketUrl,
		ticketAdmissionRequired = false,
		ticketActionEligible = true,
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
		/** Whether ticket/attendance actions are still open for this event. */
		ticketActionEligible?: boolean;
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

	let hasTicketCta = $derived(
		ticketActionEligible && isAtmosphereTicketsUrlForEvent(ticketUrl, eventUri)
	);
	let attendanceClosed = $derived(ticketAdmissionRequired && !ticketActionEligible);
	let ticketUnavailable = $derived(
		ticketActionEligible && ticketAdmissionRequired && !hasTicketCta
	);
	let combineTicketAndRsvp = $derived(
		ticketAdmissionRequired && ticketActionEligible && showRsvpPanel && viewer.isLoggedIn
	);
</script>

{#if !attendanceClosed}
	{#if ticketUrl && hasTicketCta && !combineTicketAndRsvp}
		<GetTicketsNotice url={ticketUrl} {eventUri} />
	{:else if ticketUnavailable && !combineTicketAndRsvp}
		<GetTicketsNotice {eventUri} unavailable={true} />
	{/if}

	{#if showRsvpPanel}
		{#if rsvpExternalOnly && externalSourceUrl && !ticketAdmissionRequired}
			<ExternalRsvpNotice url={externalSourceUrl} />
		{:else}
			<EventRsvp
				{eventUri}
				{eventCid}
				{initialRsvpStatus}
				{initialRsvpRkey}
				{spaceUri}
				ticketUrl={combineTicketAndRsvp ? ticketUrl : undefined}
				ticketRequired={ticketAdmissionRequired}
				allowGoing={!ticketAdmissionRequired}
				{adapter}
				{viewer}
				{onrsvp}
				{oncancel}
			/>
		{/if}
	{/if}
{/if}
