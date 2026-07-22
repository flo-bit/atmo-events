<script lang="ts">
	import { Badge, Button, Modal } from '@foxui/core';
	import {
		formatTicketPrice,
		type EventTicketingView,
		type TicketOrderPreviewView,
		type TicketTierView
	} from './tickets.js';
	import {
		bindTicketOrderPreview,
		hasAcceptedOrganizerTicketTerms,
		isTicketOrderPreviewCurrent,
		normalizeTicketOfferCode,
		resolveStableTicketPurchaseIntent,
		TICKET_PREVIEW_DEBOUNCE_MS,
		ticketOfferNeedsVerifiedPreview,
		ticketPurchaseIntentSelectionKey,
		ticketPurchasePriceSummary,
		withTicketPreviewTimeout,
		type AppliedTicketOrderPreview,
		type TicketPurchaseIntent,
		type TicketPurchaseIntentSelection,
		type TicketPurchaseSelection
	} from './ticket-purchase.js';

	// Atmosphere Tickets (ATM) purchase entry point. The event page stays
	// compact; live inventory, quantities and the viewer's issued passes live in
	// the focused ticket picker. Unticketed events never render this component.
	let {
		ticketing,
		loggedIn,
		hostName,
		open = $bindable(false),
		standalone = false,
		onbuy,
		onpreviewoffer,
		onlogin
	}: {
		ticketing: EventTicketingView;
		loggedIn: boolean;
		hostName: string;
		/** Controlled by the event attendance card's primary action. */
		open?: boolean;
		/** Keeps ticket access available for imported, externally-RSVP'd events. */
		standalone?: boolean;
		/** Starts a purchase (redirect to ATM checkout) or an immediate free claim. */
		onbuy?: (input: {
			tierId: string;
			quantity: number;
			offerCode?: string;
			organizerTermsAccepted?: boolean;
			organizerTermsVersion?: string;
			intentId: string;
		}) => Promise<void>;
		/** Gets an authoritative, non-reserving total for the current selection. */
		onpreviewoffer?: (input: {
			tierId: string;
			quantity: number;
			offerCode?: string;
		}) => Promise<TicketOrderPreviewView>;
		onlogin?: () => void;
	} = $props();

	let purchaseResultOpened = $state(false);
	let guestChoiceOpen = $state(false);
	let quantities = $state<Record<string, number>>({});
	let selectedTierId = $state<string | null>(null);
	let buyingTierId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let pendingGuestTier = $state<TicketTierView | null>(null);
	let brandIconFailed = $state(false);
	let offerCodeOpen = $state(false);
	let offerCode = $state('');
	let appliedOfferCode = $state('');
	let organizerTermsAccepted = $state(false);
	let orderPreview = $state<AppliedTicketOrderPreview | null>(null);
	let previewing = $state(false);
	let previewError = $state<string | null>(null);
	let previewNonce = $state(0);
	let previewRequestSequence = 0;
	let purchaseIntent = $state<TicketPurchaseIntent | null>(null);
	let observedOrganizerTermsVersion = $state<string | null>(null);

	let hasPaidTickets = $derived(ticketing.tiers.some((tier) => (tier.unitAmount ?? 0) > 0));
	let hasAvailableTickets = $derived(ticketing.tiers.some(isBuyable));
	let activeViewerTickets = $derived(
		ticketing.viewerTickets.filter((ticket) => ticket.status === 'active')
	);
	let lowestPrice = $derived.by(() => {
		const visible = ticketing.tiers.filter((tier) => tier.status !== 'hidden');
		if (visible.length === 0) return null;
		const available = visible.filter(isBuyable);
		const priced = [...(available.length > 0 ? available : visible)].sort(
			(a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0)
		);
		return priced[0] ?? null;
	});
	let selectedTier = $derived(
		ticketing.tiers.find((tier) => tier.tierId === selectedTierId && isBuyable(tier)) ??
			ticketing.tiers.find(isBuyable) ??
			null
	);
	let currentSelection: TicketPurchaseSelection | null = $derived(
		selectedTier
			? {
					tierId: selectedTier.tierId,
					quantity: quantityFor(selectedTier),
					...(normalizeTicketOfferCode(appliedOfferCode)
						? { offerCode: normalizeTicketOfferCode(appliedOfferCode) }
						: {})
				}
			: null
	);
	let currentOrderPreview = $derived(
		currentSelection && isTicketOrderPreviewCurrent(orderPreview, currentSelection)
			? orderPreview
			: null
	);
	let priceSummary = $derived(
		selectedTier && currentSelection
			? ticketPurchasePriceSummary(selectedTier, currentSelection, currentOrderPreview)
			: null
	);
	let currentPurchaseIntentSelection: TicketPurchaseIntentSelection | null = $derived(
		currentSelection
			? {
					...currentSelection,
					...(ticketing.organizerTerms?.version
						? { organizerTermsVersion: ticketing.organizerTerms.version }
						: {})
				}
			: null
	);
	let currentPurchaseIntentKey = $derived(
		currentPurchaseIntentSelection
			? ticketPurchaseIntentSelectionKey(currentPurchaseIntentSelection)
			: null
	);
	let appliedOfferNeedsPreview = $derived(
		currentSelection
			? ticketOfferNeedsVerifiedPreview(currentSelection, currentOrderPreview)
			: false
	);

	$effect(() => {
		const selectionKey = currentPurchaseIntentKey;
		if (purchaseIntent && selectionKey !== purchaseIntent.selectionKey) {
			purchaseIntent = null;
		}
	});

	$effect(() => {
		const version = ticketing.organizerTerms?.version ?? null;
		if (version !== observedOrganizerTermsVersion) {
			observedOrganizerTermsVersion = version;
			organizerTermsAccepted = false;
		}
	});

	$effect(() => {
		if (ticketing.purchaseStatus && !purchaseResultOpened) {
			purchaseResultOpened = true;
			open = true;
		}
	});

	$effect(() => {
		previewNonce;
		const pickerOpen = open;
		const selection = currentSelection;
		const preview = onpreviewoffer;
		if (!pickerOpen || !selection || !preview) {
			previewRequestSequence += 1;
			orderPreview = null;
			previewing = false;
			return;
		}
		const requestSequence = ++previewRequestSequence;
		previewing = true;
		previewError = null;
		const debounce = setTimeout(() => {
			void withTicketPreviewTimeout(preview(selection))
				.then((result) => {
					if (requestSequence !== previewRequestSequence) return;
					orderPreview = bindTicketOrderPreview(selection, result);
				})
				.catch((e) => {
					if (requestSequence !== previewRequestSequence) return;
					orderPreview = null;
					previewError = messageFrom(e);
				})
				.finally(() => {
					if (requestSequence === previewRequestSequence) previewing = false;
				});
		}, TICKET_PREVIEW_DEBOUNCE_MS);
		return () => {
			clearTimeout(debounce);
			if (requestSequence === previewRequestSequence) {
				previewRequestSequence += 1;
				previewing = false;
			}
		};
	});

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

	function openTicketPicker() {
		errorMessage = null;
		open = true;
	}

	async function buy(tier: TicketTierView) {
		if (!onbuy || buyingTierId) return;
		errorMessage = null;
		const normalizedOfferCode = normalizeTicketOfferCode(appliedOfferCode);
		if (normalizedOfferCode && normalizedOfferCode.length < 3) {
			errorMessage = 'Enter the full offer code.';
			return;
		}
		if (
			currentSelection &&
			ticketOfferNeedsVerifiedPreview(currentSelection, currentOrderPreview)
		) {
			errorMessage = 'Apply and verify the offer code before continuing.';
			return;
		}
		if (ticketing.organizerTermsError) {
			errorMessage = ticketing.organizerTermsError;
			return;
		}
		const intentId = purchaseIntentForCurrentSelection();
		buyingTierId = tier.tierId;
		try {
			await onbuy({
				tierId: tier.tierId,
				quantity: quantityFor(tier),
				...(normalizedOfferCode ? { offerCode: normalizedOfferCode } : {}),
				...(ticketing.organizerTerms
					? {
							organizerTermsAccepted,
							organizerTermsVersion: ticketing.organizerTerms.version
						}
					: {}),
				intentId
			});
			// A completed claim or launched checkout consumes this logical attempt.
			// Failures retain it so transport/user retries remain idempotent.
			purchaseIntent = null;
		} catch (e) {
			errorMessage = messageFrom(e);
		} finally {
			buyingTierId = null;
		}
	}

	function startPurchase(tier: TicketTierView) {
		if (!loggedIn && !isFree(tier)) {
			pendingGuestTier = tier;
			guestChoiceOpen = true;
			return;
		}
		void buy(tier);
	}

	function logInBeforeCheckout() {
		guestChoiceOpen = false;
		pendingGuestTier = null;
		open = false;
		onlogin?.();
	}

	function logInToClaim() {
		open = false;
		onlogin?.();
	}

	function continueAsGuest() {
		const tier = pendingGuestTier;
		guestChoiceOpen = false;
		pendingGuestTier = null;
		if (tier) void buy(tier);
	}

	function startSelectedPurchase() {
		if (!selectedTier) return;
		if (ticketing.organizerTermsError) {
			errorMessage = ticketing.organizerTermsError;
			return;
		}
		if (!hasAcceptedOrganizerTicketTerms(ticketing.organizerTerms, organizerTermsAccepted)) {
			errorMessage = 'Accept the organizer’s terms to continue.';
			return;
		}
		if (isFree(selectedTier) && !loggedIn) {
			logInToClaim();
			return;
		}
		startPurchase(selectedTier);
	}

	function purchaseIntentForCurrentSelection(): string {
		if (!currentPurchaseIntentSelection) {
			throw new Error('Choose a ticket before continuing.');
		}
		purchaseIntent = resolveStableTicketPurchaseIntent(
			purchaseIntent,
			currentPurchaseIntentSelection,
			() => crypto.randomUUID()
		);
		return purchaseIntent.intentId;
	}

	function applyOfferCode() {
		const normalized = normalizeTicketOfferCode(offerCode);
		if (!normalized || normalized.length < 3) {
			errorMessage = 'Enter the full offer code.';
			return;
		}
		errorMessage = null;
		previewError = null;
		appliedOfferCode = normalized;
		offerCode = normalized;
		previewNonce += 1;
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

	function dateValue(value: string | undefined): Date | null {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function formatSaleDate(value: string): string {
		const date = dateValue(value);
		if (!date) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function availabilityLabel(tier: TicketTierView): string {
		if (tier.status === 'sold-out' || tier.availableQuantity === 0) return 'Sold out';
		const now = Date.now();
		const startsAt = dateValue(tier.saleStartsAt);
		if (startsAt && startsAt.getTime() > now) {
			return `Sales open ${formatSaleDate(tier.saleStartsAt!)}`;
		}
		const endsAt = dateValue(tier.saleEndsAt);
		if (endsAt && endsAt.getTime() <= now) return 'Sales ended';
		if (tier.status !== 'available') return 'Not currently on sale';
		if (tier.availableQuantity <= 10) return `${tier.availableQuantity} left`;
		if (endsAt) return `Sales end ${formatSaleDate(tier.saleEndsAt!)}`;
		return 'Available';
	}

	const stepperButtonClass =
		'border-base-200 dark:border-base-700 text-base-700 dark:text-base-200 hover:bg-base-200 dark:hover:bg-base-700 focus-visible:ring-accent-500 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';
</script>

{#if standalone}
	<section
		class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 rounded-2xl border p-4"
		aria-label="Event tickets"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<p class="text-base-900 dark:text-base-50 font-semibold">
						{#if lowestPrice}
							Tickets from {formatTicketPrice(lowestPrice.unitAmount, lowestPrice.currency)}
						{:else}
							Event tickets
						{/if}
					</p>
					{#if ticketing.environment === 'test'}
						<Badge size="sm" variant="secondary">Test mode</Badge>
					{/if}
				</div>
				{#if hasPaidTickets}
					<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
						Payments go directly to {hostName}.
					</p>
				{/if}
			</div>
			<Button onclick={openTicketPicker} class="w-full shrink-0 sm:w-auto">
				<svg viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true">
					<path
						d="M5.5 7.25h13a1.75 1.75 0 0 1 1.75 1.75v1a2.25 2.25 0 0 0 0 4v1A1.75 1.75 0 0 1 18.5 16.75h-13A1.75 1.75 0 0 1 3.75 15v-1a2.25 2.25 0 0 0 0-4V9A1.75 1.75 0 0 1 5.5 7.25Z"
						stroke="currentColor"
						stroke-width="1.5"
					/>
					<path d="M9 7.5v9" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" />
				</svg>
				{activeViewerTickets.length > 0 || !hasAvailableTickets ? 'View tickets' : 'Buy tickets'}
			</Button>
		</div>
	</section>
{/if}

<Modal
	bind:open
	closeButton
	onOpenAutoFocus={(event: Event) => event.preventDefault()}
	class="overflow-hidden p-0 sm:max-w-xl"
>
	<div class="px-5 pt-5 pr-14 pb-2">
		<div class="flex flex-wrap items-center gap-2.5">
			{#if ticketing.iconUrl && !brandIconFailed}
				<img
					src={ticketing.iconUrl}
					alt=""
					class="size-5 shrink-0 object-contain brightness-0 dark:invert"
					onerror={() => (brandIconFailed = true)}
				/>
			{:else}
				<svg
					viewBox="0 0 24 24"
					fill="none"
					class="text-base-900 dark:text-base-50 size-5 shrink-0"
					aria-hidden="true"
				>
					<path
						d="M5.5 7.25h13a1.75 1.75 0 0 1 1.75 1.75v1a2.25 2.25 0 0 0 0 4v1A1.75 1.75 0 0 1 18.5 16.75h-13A1.75 1.75 0 0 1 3.75 15v-1a2.25 2.25 0 0 0 0-4V9A1.75 1.75 0 0 1 5.5 7.25Z"
						stroke="currentColor"
						stroke-width="1.5"
					/>
					<path d="M9 7.5v9" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" />
				</svg>
			{/if}
			<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Choose tickets</h2>
			{#if ticketing.environment === 'test'}
				<Badge size="sm" variant="secondary">No real charges</Badge>
			{/if}
		</div>
	</div>

	<div class="max-h-[70vh] overflow-y-auto px-5 py-4">
		{#if ticketing.purchaseStatus}
			<div
				class={`mb-4 flex items-start gap-3 rounded-xl p-3 ${ticketing.purchaseStatus === 'confirmed' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-base-100 dark:bg-base-800/60'}`}
				role="status"
			>
				<svg
					viewBox="0 0 20 20"
					fill="currentColor"
					class={`mt-0.5 size-4 shrink-0 ${ticketing.purchaseStatus === 'confirmed' ? 'text-green-600 dark:text-green-400' : 'text-base-500 dark:text-base-300'}`}
					aria-hidden="true"
				>
					{#if ticketing.purchaseStatus === 'confirmed'}
						<path
							fill-rule="evenodd"
							d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
							clip-rule="evenodd"
						/>
					{:else}
						<path
							d="M10 3.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path
							d="M10 6.25V10l2.5 1.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					{/if}
				</svg>
				<div>
					<p class="text-base-900 dark:text-base-50 text-sm font-semibold">
						{ticketing.purchaseStatus === 'confirmed'
							? 'Payment confirmed'
							: 'Confirming your order'}
					</p>
					<p class="text-base-700 dark:text-base-300 mt-0.5 text-xs leading-5">
						{#if ticketing.purchaseStatus === 'processing'}
							Your payment is still being confirmed. Your tickets will be emailed once they're
							issued.
						{:else if activeViewerTickets.length > 0}
							Your tickets are ready below and have also been sent by email.
						{:else if loggedIn}
							Your tickets will appear here as soon as they're issued. They're also sent by email.
						{:else}
							Your tickets will be sent to the email address used at checkout.
						{/if}
					</p>
				</div>
			</div>
		{/if}

		{#if ticketing.viewerTickets.length > 0}
			<section class="mb-5" aria-labelledby="viewer-tickets-title">
				<h3
					id="viewer-tickets-title"
					class="text-base-500 dark:text-base-400 mb-2 text-xs font-semibold tracking-wider uppercase"
				>
					Your tickets
				</h3>
				<ul class="flex flex-col gap-2">
					{#each ticketing.viewerTickets as ticket (ticket.id)}
						<li
							class="border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-900/60 flex items-center justify-between gap-3 rounded-xl border p-3"
						>
							<div class="min-w-0">
								<p class="text-base-900 dark:text-base-50 truncate text-sm font-semibold">
									{ticket.tierTitle ?? 'Ticket'}
								</p>
								<p class="text-base-500 dark:text-base-400 text-xs">
									<span class="tabular-nums">#{ticket.ticketNumber}</span>
									{#if ticket.status !== 'active'}
										· <span class="capitalize">{ticket.status}</span>{/if}
								</p>
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
			</section>
		{/if}

		<section aria-labelledby="ticket-options-title">
			<h3
				id="ticket-options-title"
				class="text-base-500 dark:text-base-400 mb-2 text-xs font-semibold tracking-wider uppercase"
			>
				Ticket options
			</h3>
			<ul class="flex flex-col gap-3">
				{#each ticketing.tiers as tier (tier.tierId)}
					<li
						class={`bg-base-50 dark:bg-base-900/40 overflow-hidden rounded-2xl border transition-colors ${selectedTier?.tierId === tier.tierId ? 'border-accent-500 ring-accent-500/20 ring-2' : 'border-base-200 dark:border-base-800'}`}
					>
						<button
							type="button"
							class="flex w-full items-start gap-3 p-4 text-left disabled:cursor-default"
							disabled={!isBuyable(tier) || buyingTierId !== null}
							onclick={() => {
								selectedTierId = tier.tierId;
								errorMessage = null;
							}}
						>
							<span
								class={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${selectedTier?.tierId === tier.tierId ? 'border-accent-600 bg-accent-600' : 'border-base-300 dark:border-base-600'}`}
								aria-hidden="true"
							>
								{#if selectedTier?.tierId === tier.tierId}
									<span class="size-1.5 rounded-full bg-white"></span>
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="text-base-900 dark:text-base-50 block font-semibold">{tier.title}</span
								>
								{#if tier.description}
									<span class="text-base-600 dark:text-base-400 mt-1 block text-sm leading-5">
										{tier.description}
									</span>
								{/if}
							</span>
							<span class="shrink-0 text-right">
								<span
									class="text-base-900 dark:text-base-50 block text-sm font-semibold tabular-nums"
								>
									{formatTicketPrice(tier.unitAmount, tier.currency)}
								</span>
								<span
									class:text-amber-700={tier.status === 'available' && tier.availableQuantity <= 10}
									class:dark:text-amber-400={tier.status === 'available' &&
										tier.availableQuantity <= 10}
									class:text-base-500={!(
										tier.status === 'available' && tier.availableQuantity <= 10
									)}
									class:dark:text-base-400={!(
										tier.status === 'available' && tier.availableQuantity <= 10
									)}
									class="mt-1 block text-xs"
								>
									{availabilityLabel(tier)}
								</span>
							</span>
						</button>

						{#if selectedTier?.tierId === tier.tierId && maxFor(tier) > 1}
							<div
								class="border-base-200 dark:border-base-800 flex items-center justify-between border-t px-4 py-3"
							>
								<span class="text-base-600 dark:text-base-400 text-sm">Quantity</span>
								<div class="flex items-center gap-1.5" aria-label={`Quantity for ${tier.title}`}>
									<button
										type="button"
										class={stepperButtonClass}
										aria-label={`Fewer ${tier.title} tickets`}
										disabled={quantityFor(tier) <= 1 || buyingTierId !== null}
										onclick={() => adjustQuantity(tier, -1)}
									>
										&minus;
									</button>
									<span class="w-6 text-center text-sm tabular-nums" aria-live="polite">
										{quantityFor(tier)}
									</span>
									<button
										type="button"
										class={stepperButtonClass}
										aria-label={`More ${tier.title} tickets`}
										disabled={quantityFor(tier) >= maxFor(tier) || buyingTierId !== null}
										onclick={() => adjustQuantity(tier, 1)}
									>
										+
									</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<div class="border-base-200 dark:border-base-800 mt-4 border-t pt-4">
			{#if offerCodeOpen}
				<label
					for="atmosphere-ticket-offer-code"
					class="text-base-700 dark:text-base-300 text-sm font-medium"
				>
					Offer code
				</label>
				<div class="mt-2 flex items-center gap-2">
					<input
						id="atmosphere-ticket-offer-code"
						type="text"
						bind:value={offerCode}
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						maxlength="64"
						placeholder="Enter code"
						disabled={buyingTierId !== null}
						class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 text-base-900 dark:text-base-50 placeholder:text-base-400 focus:border-accent-500 focus:ring-accent-500 min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm uppercase focus:ring-1 focus:outline-none disabled:opacity-60"
					/>
					<Button
						variant="secondary"
						disabled={buyingTierId !== null || !selectedTier}
						onclick={applyOfferCode}
					>
						{previewing &&
						normalizeTicketOfferCode(offerCode) === normalizeTicketOfferCode(appliedOfferCode)
							? 'Applying…'
							: 'Apply'}
					</Button>
					<button
						type="button"
						class="text-base-500 hover:text-base-900 dark:text-base-400 dark:hover:text-base-50 shrink-0 px-2 py-2 text-sm"
						disabled={buyingTierId !== null}
						onclick={() => {
							offerCode = '';
							appliedOfferCode = '';
							offerCodeOpen = false;
							errorMessage = null;
							previewError = null;
						}}
					>
						Remove
					</button>
				</div>
				<p class="text-base-500 dark:text-base-400 mt-1.5 text-xs">
					Apply to preview the authoritative discount and total before checkout.
				</p>
				{#if appliedOfferCode && currentOrderPreview}
					<p class="mt-1.5 text-xs text-green-700 dark:text-green-400">
						{currentOrderPreview.offerLabel || appliedOfferCode} applied
					</p>
				{/if}
			{:else}
				<button
					type="button"
					class="text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 text-sm font-medium"
					onclick={() => (offerCodeOpen = true)}
				>
					Have an offer code?
				</button>
			{/if}
		</div>

		{#if selectedTier && priceSummary}
			<section
				class="border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-900/40 mt-4 rounded-2xl border p-4"
				aria-labelledby="ticket-order-summary-title"
			>
				<h3
					id="ticket-order-summary-title"
					class="text-base-500 dark:text-base-400 text-xs font-semibold tracking-wider uppercase"
				>
					Order summary
				</h3>
				<div class="mt-3 flex items-start justify-between gap-4 text-sm">
					<div class="min-w-0">
						<p class="text-base-900 dark:text-base-50 truncate font-medium">{selectedTier.title}</p>
						<p class="text-base-500 dark:text-base-400 mt-0.5 text-xs">
							Quantity {quantityFor(selectedTier)}
						</p>
					</div>
					<p class="text-base-900 dark:text-base-50 shrink-0 font-medium tabular-nums">
						{formatTicketPrice(priceSummary.subtotalAmount, priceSummary.currency)}
					</p>
				</div>
				<div class="border-base-200 dark:border-base-800 mt-3 space-y-2 border-t pt-3 text-sm">
					<div class="text-base-600 dark:text-base-400 flex items-center justify-between gap-4">
						<span>Subtotal</span>
						<span class="tabular-nums">
							{formatTicketPrice(priceSummary.subtotalAmount, priceSummary.currency)}
						</span>
					</div>
					{#if priceSummary.buyerFeeAmount > 0}
						<div class="text-base-600 dark:text-base-400 flex items-center justify-between gap-4">
							<span>Fees</span>
							<span class="tabular-nums">
								{formatTicketPrice(priceSummary.buyerFeeAmount, priceSummary.currency)}
							</span>
						</div>
					{/if}
					<div class="text-base-600 dark:text-base-400 flex items-center justify-between gap-4">
						<span>
							Discount{priceSummary.offerLabel ? ` · ${priceSummary.offerLabel}` : ''}
						</span>
						<span class="tabular-nums">
							{priceSummary.discountAmount > 0
								? `−${formatTicketPrice(priceSummary.discountAmount, priceSummary.currency)}`
								: '—'}
						</span>
					</div>
					<div
						class="border-base-200 dark:border-base-800 text-base-900 dark:text-base-50 flex items-center justify-between gap-4 border-t pt-2 font-semibold"
					>
						<span>Total</span>
						<span class="tabular-nums">
							{formatTicketPrice(priceSummary.totalAmount, priceSummary.currency)}
						</span>
					</div>
				</div>
				{#if previewing}
					<p class="text-base-500 dark:text-base-400 mt-2 text-xs" aria-live="polite">
						Updating total…
					</p>
				{:else if previewError || !onpreviewoffer}
					<div class="mt-2 flex items-center justify-between gap-3">
						<p
							class:text-red-600={appliedOfferNeedsPreview}
							class:dark:text-red-400={appliedOfferNeedsPreview}
							class:text-base-500={!appliedOfferNeedsPreview}
							class:dark:text-base-400={!appliedOfferNeedsPreview}
							class="text-xs leading-4"
						>
							{#if appliedOfferNeedsPreview}
								{previewError || 'Offer code verification is unavailable.'} Remove the code or retry before
								checkout.
							{:else}
								Live pricing couldn’t be loaded. Final price will be confirmed at checkout.
							{/if}
						</p>
						{#if onpreviewoffer}
							<button
								type="button"
								class="text-accent-600 dark:text-accent-400 shrink-0 text-xs font-medium"
								onclick={() => (previewNonce += 1)}
							>
								Retry
							</button>
						{/if}
					</div>
				{/if}

				{#if ticketing.organizerTermsError}
					<div
						class="mt-4 rounded-xl bg-red-100 px-3 py-2.5 text-xs leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-300"
						role="alert"
					>
						{ticketing.organizerTermsError}
					</div>
				{/if}

				{#if ticketing.organizerTerms}
					<div
						class="border-base-200 dark:border-base-800 mt-4 flex items-start gap-2.5 border-t pt-4"
					>
						<input
							id="organizer-ticket-terms"
							type="checkbox"
							bind:checked={organizerTermsAccepted}
							class="accent-accent-600 mt-0.5 size-4 shrink-0"
						/>
						<p class="text-base-600 dark:text-base-400 text-xs leading-5">
							<label for="organizer-ticket-terms">I agree to the organizer’s </label>
							<a
								href={ticketing.organizerTerms.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-accent-600 dark:text-accent-400 hover:underline"
							>
								{ticketing.organizerTerms.label || 'event terms'}
							</a>.
						</p>
					</div>
				{/if}
				<Button
					onclick={startSelectedPurchase}
					disabled={buyingTierId !== null ||
						!onbuy ||
						previewing ||
						appliedOfferNeedsPreview ||
						!!ticketing.organizerTermsError ||
						!hasAcceptedOrganizerTicketTerms(ticketing.organizerTerms, organizerTermsAccepted)}
					class="mt-4 w-full"
				>
					{buyingTierId === selectedTier.tierId
						? 'Starting…'
						: isFree(selectedTier)
							? loggedIn
								? quantityFor(selectedTier) === 1
									? 'Claim ticket'
									: 'Claim tickets'
								: 'Log in to claim'
							: 'Continue to checkout'}
				</Button>
			</section>
		{/if}

		{#if errorMessage}
			<div
				class="mt-4 rounded-xl bg-red-100 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
				role="alert"
			>
				{errorMessage}
			</div>
		{/if}

		<p class="text-base-500 dark:text-base-400 mt-4 text-[11px] leading-4">
			Tickets are emailed after purchase.{hasPaidTickets
				? ` Payments go directly to ${hostName}.`
				: ''}
		</p>
	</div>
</Modal>

<Modal bind:open={guestChoiceOpen} closeButton>
	<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Save to Atmosphere and RSVP?</h2>
	<p class="text-base-500 dark:text-base-400 mt-2 text-sm leading-6">
		Your tickets will be emailed to the address you use at checkout either way. Log in first to also
		save them to your Atmosphere account and RSVP as Going.
	</p>
	<div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
		<Button class="flex-1" onclick={logInBeforeCheckout}>Log in to Save & RSVP</Button>
		<Button class="flex-1" variant="secondary" onclick={continueAsGuest}>Continue as guest</Button>
	</div>
</Modal>
