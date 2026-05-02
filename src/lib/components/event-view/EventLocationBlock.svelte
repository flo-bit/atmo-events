<script lang="ts">
	import type { LocationData } from './format';

	let { locationData }: { locationData: LocationData | null } = $props();
</script>

{#if locationData}
	<a
		href={locationData.googleMapsUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="mb-6 flex items-center gap-4 transition-opacity hover:opacity-80"
	>
		<div
			class="border-base-200 dark:border-base-700 bg-base-100 dark:bg-base-950/30 flex size-12 shrink-0 items-center justify-center rounded-xl border"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="text-base-900 dark:text-base-200 size-5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
				/>
			</svg>
		</div>
		<div>
			{#if locationData.name}
				<p class="text-base-900 dark:text-base-50 font-semibold">{locationData.name}</p>
				<p class="text-base-500 dark:text-base-400 text-sm">{locationData.shortAddress}</p>
			{:else}
				<p class="text-base-900 dark:text-base-50 font-semibold">
					{locationData.shortAddress}
				</p>
			{/if}
		</div>
	</a>
{/if}
