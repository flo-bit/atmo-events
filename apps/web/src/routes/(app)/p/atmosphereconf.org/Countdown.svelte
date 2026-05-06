<script lang="ts">
	import NumberFlow, { NumberFlowGroup } from '@number-flow/svelte';
	import { onMount } from 'svelte';

	let { targetDate }: { targetDate: string } = $props();

	let now = $state(Date.now());

	onMount(() => {
		const interval = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	let remaining = $derived(Math.max(0, new Date(targetDate).getTime() - now));

	let dd = $derived(Math.floor(remaining / 86400000));
	let hh = $derived(Math.floor((remaining % 86400000) / 3600000));
	let mm = $derived(Math.floor((remaining % 3600000) / 60000));
	let ss = $derived(Math.floor((remaining % 60000) / 1000));
</script>

{#if remaining > 0}
	<div class="text-center">
		<p class="text-base-500 dark:text-base-400 mb-3 text-sm font-medium uppercase tracking-wider">
			Doors open in
		</p>
		<NumberFlowGroup>
			<div
				class="flex w-full justify-center gap-4 sm:gap-6"
				style="font-variant-numeric: tabular-nums;"
			>
				{#if dd > 0}
					<div class="flex flex-col items-center">
						<div class="text-base-900 dark:text-base-100 text-5xl font-bold sm:text-7xl">
							<NumberFlow value={dd} trend={-1} format={{ minimumIntegerDigits: 2 }} />
						</div>
						<span class="text-base-400 dark:text-base-500 mt-1 text-xs font-medium uppercase tracking-wider">days</span>
					</div>
				{/if}
				<div class="flex flex-col items-center">
					<div class="text-base-900 dark:text-base-100 text-5xl font-bold sm:text-7xl">
						<NumberFlow value={hh} trend={-1} format={{ minimumIntegerDigits: 2 }} />
					</div>
					<span class="text-base-400 dark:text-base-500 mt-1 text-xs font-medium uppercase tracking-wider">hours</span>
				</div>
				<div class="flex flex-col items-center">
					<div class="text-base-900 dark:text-base-100 text-5xl font-bold sm:text-7xl">
						<NumberFlow value={mm} trend={-1} format={{ minimumIntegerDigits: 2 }} digits={{ 1: { max: 5 } }} />
					</div>
					<span class="text-base-400 dark:text-base-500 mt-1 text-xs font-medium uppercase tracking-wider">mins</span>
				</div>
				<div class="flex flex-col items-center">
					<div class="text-base-900 dark:text-base-100 text-5xl font-bold sm:text-7xl">
						<NumberFlow value={ss} trend={-1} format={{ minimumIntegerDigits: 2 }} digits={{ 1: { max: 5 } }} />
					</div>
					<span class="text-base-400 dark:text-base-500 mt-1 text-xs font-medium uppercase tracking-wider">secs</span>
				</div>
			</div>
		</NumberFlowGroup>
	</div>
{/if}
