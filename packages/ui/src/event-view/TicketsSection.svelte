<script lang="ts">
	import { Badge, Button } from '@foxui/core';
	import { formatTicketPrice, type EventTicketingView, type TicketTierView } from './tickets.js';

	// Atmosphere Tickets (ATM) section: tiers + availability, the viewer's own
	// tickets, and the buy/claim entry point. Rendered only when the host
	// configured ATM tickets for this event (the server load returns null
	// otherwise), so unticketed events are untouched.
	let {
		ticketing,
		loggedIn,
		onbuy,
		onlogin
	}: {
		ticketing: EventTicketingView;
		loggedIn: boolean;
		/** Starts a purchase (redirect to ATM checkout) or an immediate free claim. */
		onbuy?: (input: { tierId: string; quantity: number }) => Promise<void>;
		onlogin?: () => void;
	} = $props();

	let quantities = $state<Record<string, number>>({});
	let buyingTierId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	function isFree(tier: TicketTierView): boolean {
		return !tier.unitAmount;
	}

	function maxFor(tier: TicketTierView): number {
		return Math.max(1, Math.min(tier.maxPerOrder, tier.availableQuantity));
	}

	function quantityFor(tier: TicketTierView): number {
		return Math.min(quantities[tier.tierId] ?? 1, maxFor(tier));
	}

	function adjustQuantity(tier: TicketTierView, delta: number) {
		quantities[tier.tierId] = Math.min(Math.max(quantityFor(tier) + delta, 1), maxFor(tier));
	}

	function isBuyable(tier: TicketTierView): boolean {
		return tier.status === 'available' && tier.availableQuantity > 0;
	}

	async function buy(tier: TicketTierView) {
		if (!onbuy || buyingTierId) return;
		errorMessage = null;
		buyingTierId = tier.tierId;
		try {
			await onbuy({
				tierId: tier.tierId,
				quantity: isFree(tier) ? 1 : quantityFor(tier)
			});
		} catch (e) {
			errorMessage = messageFrom(e);
		} finally {
			buyingTierId = null;
		}
	}

	function messageFrom(e: unknown): string {
		if (e && typeof e === 'object') {
			const body = (e as { body?: { message?: string } }).body;
			if (body?.message) return body.message;
			const message = (e as { message?: string }).message;
			if (message) return message;
		}
		return 'Something went wrong — please try again.';
	}

	const stepperButtonClass =
		'border-base-200 dark:border-base-800 text-base-700 dark:text-base-300 hover:bg-base-200 dark:hover:bg-base-800 focus-visible:ring-accent-500 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';
</script>

<div
	class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 rounded-2xl border p-4"
>
	<div class="mb-3 flex items-center justify-between gap-2">
		<p class="text-base-500 dark:text-base-400 text-xs font-semibold tracking-wider uppercase">
			Tickets
		</p>
		{#if ticketing.environment === 'test'}
			<Badge size="sm" variant="secondary">Test mode — no real charges</Badge>
		{/if}
	</div>

	{#if ticketing.justPurchased}
		<div
			class="mb-4 flex items-center gap-3 rounded-xl bg-green-100 p-3 dark:bg-green-900/30"
			role="status"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="size-4 shrink-0 text-green-600 dark:text-green-400"
				aria-hidden="true"
			>
				<path
					fill-rule="evenodd"
					d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
					clip-rule="evenodd"
				/>
			</svg>
			<p class="text-base-900 dark:text-base-50 text-sm">
				Payment complete! Your tickets appear below as soon as they're issued — refresh in a moment
				if they haven't yet.
			</p>
		</div>
	{/if}

	{#if ticketing.viewerTickets.length > 0}
		<div class="mb-4">
			<p
				class="text-base-500 dark:text-base-400 mb-2 text-xs font-semibold tracking-wider uppercase"
			>
				Your tickets
			</p>
			<ul class="flex flex-col gap-2">
				{#each ticketing.viewerTickets as ticket (ticket.id)}
					<li class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<p class="text-base-900 dark:text-base-50 truncate text-sm font-semibold">
								{ticket.tierTitle ?? 'Ticket'}
								<span class="text-base-500 dark:text-base-400 font-normal tabular-nums">
									#{ticket.ticketNumber}
								</span>
							</p>
							{#if ticket.status !== 'active'}
								<p class="text-base-500 dark:text-base-400 text-xs capitalize">{ticket.status}</p>
							{/if}
						</div>
						{#if ticket.scanUrl && ticket.status === 'active'}
							<Button
								href={ticket.scanUrl}
								target="_blank"
								rel="noopener noreferrer"
								variant="secondary"
								class="shrink-0"
							>
								View pass
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<ul class="flex flex-col gap-4">
		{#each ticketing.tiers as tier (tier.tierId)}
			<li class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<p class="text-base-900 dark:text-base-50 text-sm font-semibold">{tier.title}</p>
					{#if tier.description}
						<p class="text-base-600 dark:text-base-400 mt-0.5 text-xs">{tier.description}</p>
					{/if}
					<p class="text-base-600 dark:text-base-400 mt-0.5 text-xs">
						<span class="text-base-900 dark:text-base-50 font-semibold tabular-nums">
							{formatTicketPrice(tier.unitAmount, tier.currency)}
						</span>
						{#if tier.status === 'sold-out' || tier.availableQuantity === 0}
							· Sold out
						{:else if tier.status !== 'available'}
							· Not on sale
						{:else if tier.availableQuantity <= 10}
							· <span class="tabular-nums">{tier.availableQuantity}</span> left
						{/if}
					</p>
				</div>
				{#if isBuyable(tier)}
					<div class="flex shrink-0 items-center gap-3">
						{#if loggedIn}
							{#if !isFree(tier) && maxFor(tier) > 1}
								<div class="flex items-center gap-1.5">
									<button
										type="button"
										class={stepperButtonClass}
										aria-label="Fewer tickets"
										disabled={quantityFor(tier) <= 1 || buyingTierId !== null}
										onclick={() => adjustQuantity(tier, -1)}
									>
										&minus;
									</button>
									<span class="w-5 text-center text-sm tabular-nums" aria-live="polite">
										{quantityFor(tier)}
									</span>
									<button
										type="button"
										class={stepperButtonClass}
										aria-label="More tickets"
										disabled={quantityFor(tier) >= maxFor(tier) || buyingTierId !== null}
										onclick={() => adjustQuantity(tier, 1)}
									>
										+
									</button>
								</div>
							{/if}
							<Button
								onclick={() => buy(tier)}
								disabled={buyingTierId !== null || !onbuy}
								class="shrink-0"
							>
								{buyingTierId === tier.tierId
									? 'Starting…'
									: isFree(tier)
										? 'Claim ticket'
										: 'Get tickets'}
							</Button>
						{:else}
							<Button onclick={() => onlogin?.()} class="shrink-0">Log in to get tickets</Button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if errorMessage}
		<p class="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">{errorMessage}</p>
	{/if}

	<p class="text-base-500 dark:text-base-400 mt-3 text-xs">
		Checkout and ticket delivery are handled by
		<a
			href="https://atmosphere.money"
			target="_blank"
			rel="noopener noreferrer"
			class="text-base-700 dark:text-base-300 hover:underline">Atmosphere Money</a
		>.
	</p>
</div>
