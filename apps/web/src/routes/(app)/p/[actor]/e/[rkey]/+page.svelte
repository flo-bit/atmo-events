<script lang="ts">
	import { EventView } from '@atmo-dev/events-ui';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { buyTickets } from '$lib/atm/tickets.remote';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));

	/** Start an ATM ticket purchase: paid tiers redirect to ATM-hosted
	 *  checkout; free tiers claim immediately and refresh the page data so the
	 *  new ticket shows up under "Your tickets". */
	async function handleBuyTickets(input: { tierId: string; quantity: number }) {
		const result = await buyTickets({
			eventUri: `at://${data.actorDid}/community.lexicon.calendar.event/${data.rkey}`,
			...input
		});
		if (result.kind === 'checkout') {
			window.location.assign(result.url);
		} else {
			await invalidateAll();
		}
	}
</script>

<EventView {data} {adapter} {viewer} pageUrl={page.url} onBuyTickets={handleBuyTickets} />
