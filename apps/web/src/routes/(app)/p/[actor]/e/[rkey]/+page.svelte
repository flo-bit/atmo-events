<script lang="ts">
	import { EventView } from '@atmo-dev/events-ui';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import {
		buyTickets,
		completeTicketRsvpPurchase,
		confirmTicketRsvpPurchase,
		previewTicketOrder
	} from '$lib/atm/tickets.remote';
	import { onMount } from 'svelte';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));
	let autoRsvpGoing = $state(false);
	let autoRsvpRkey = $state<string | null>(null);

	const AUTO_RSVP_POLL_ATTEMPTS = 20;
	const AUTO_RSVP_INITIAL_DELAY_MS = 1_000;
	const AUTO_RSVP_MAX_DELAY_MS = 15_000;

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function waitForIssuedTicket(cancelled: () => boolean) {
		try {
			for (let attempt = 0; attempt < AUTO_RSVP_POLL_ATTEMPTS; attempt += 1) {
				if (cancelled()) return;
				const confirmation = await confirmTicketRsvpPurchase({
					eventUri: `at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`
				});
				if (confirmation.status === 'issued') {
					await invalidateAll();
					if (cancelled()) return;
					autoRsvpRkey = confirmation.rsvpRkey;
					autoRsvpGoing = true;
					return;
				}
				if (confirmation.status === 'failed' || confirmation.status === 'not-found') return;
				if (attempt < AUTO_RSVP_POLL_ATTEMPTS - 1) {
					await delay(Math.min(AUTO_RSVP_INITIAL_DELAY_MS * 2 ** attempt, AUTO_RSVP_MAX_DELAY_MS));
				}
			}
			console.warn(
				'[atm] Ticket issuance is still pending; automatic RSVP will retry on the next event-page load.'
			);
		} catch (e) {
			console.warn('[atm] Could not confirm ticket issuance for automatic RSVP:', e);
		}
	}

	onMount(() => {
		let cancelled = false;
		// The server only exposes this flag for the DID bound into the signed
		// intent. Do not depend on the client auth store having hydrated yet.
		if (data.autoRsvpPending) {
			void waitForIssuedTicket(() => cancelled);
		}
		return () => {
			cancelled = true;
		};
	});

	async function handleAutoRsvpComplete() {
		const rsvpRkey = autoRsvpRkey;
		try {
			if (rsvpRkey) {
				await completeTicketRsvpPurchase({
					eventUri: `at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`,
					rsvpRkey
				});
			}
		} catch (e) {
			// The signed intent deliberately remains durable. A later page load can
			// confirm the already-going RSVP and retry this acknowledgement.
			console.warn('[atm] Could not acknowledge the automatic ticket RSVP:', e);
		} finally {
			autoRsvpGoing = false;
			autoRsvpRkey = null;
		}
	}

	/** Start an ATM ticket purchase: paid tiers redirect to ATM-hosted
	 *  checkout; free tiers claim immediately and refresh the page data so the
	 *  new ticket shows up under "Your tickets". */
	async function handlePreviewTickets(input: {
		tierId: string;
		quantity: number;
		offerCode?: string;
	}) {
		return previewTicketOrder({
			eventUri: `at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`,
			...input
		});
	}

	async function handleBuyTickets(input: {
		tierId: string;
		quantity: number;
		offerCode?: string;
		organizerTermsAccepted?: boolean;
		organizerTermsVersion?: string;
		intentId: string;
	}) {
		const result = await buyTickets({
			eventUri: `at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`,
			...input
		});
		if (result.kind === 'checkout') {
			window.location.assign(result.url);
		} else {
			await invalidateAll();
			// A free claim issues synchronously, so it can trigger the same one-shot
			// automatic RSVP without waiting for a checkout return.
			autoRsvpRkey = null;
			autoRsvpGoing = true;
		}
	}
</script>

<EventView
	{data}
	{adapter}
	{viewer}
	pageUrl={page.url}
	onBuyTickets={handleBuyTickets}
	onPreviewTickets={handlePreviewTickets}
	{autoRsvpGoing}
	{autoRsvpRkey}
	onAutoRsvpComplete={handleAutoRsvpComplete}
/>
