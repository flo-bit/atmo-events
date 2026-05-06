<script lang="ts">
	import { Button, Input, Modal } from '@foxui/core';
	import { getLocationDisplayString, type EventLocation } from './types';

	let {
		location = $bindable(),
		locationChanged = $bindable()
	}: {
		location: EventLocation | null;
		locationChanged: boolean;
	} = $props();

	let showModal = $state(false);
	let searchText = $state('');
	let searching = $state(false);
	let error = $state('');
	let result: { displayName: string; location: EventLocation } | null = $state(null);

	async function search() {
		const q = searchText.trim();
		if (!q) return;
		error = '';
		searching = true;
		result = null;

		try {
			const response = await fetch('/api/geocoding?q=' + encodeURIComponent(q));
			if (!response.ok) throw new Error('response not ok');
			const data: Record<string, unknown> = await response.json();
			if (!data || data.error) throw new Error('no results');

			const addr = (data.address || {}) as Record<string, string>;
			const road = addr.road || '';
			const houseNumber = addr.house_number || '';
			const street = road ? (houseNumber ? `${road} ${houseNumber}` : road) : '';
			const locality =
				addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || '';
			const region = addr.state || addr.county || '';
			const country = addr.country || '';

			result = {
				displayName: (data.display_name as string) || q,
				location: {
					...(street && { street }),
					...(locality && { locality }),
					...(region && { region }),
					...(country && { country })
				}
			};
		} catch {
			error = "Couldn't find that location.";
		} finally {
			searching = false;
		}
	}

	function confirm() {
		if (result) {
			location = result.location;
			locationChanged = true;
		}
		showModal = false;
		searchText = '';
		result = null;
		error = '';
	}

	function remove() {
		location = null;
		locationChanged = true;
	}
</script>

{#if location}
	<div class="mb-6 flex items-center gap-4">
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
		<p class="text-base-900 dark:text-base-50 flex-1 font-semibold">
			{getLocationDisplayString(location)}
		</p>
		<Button variant="ghost" size="iconSm" onclick={remove} class="shrink-0">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="size-3.5"
			>
				<path
					d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
				/>
			</svg>
		</Button>
	</div>
{:else}
	<div class="mb-6">
		<Button variant="secondary" onclick={() => (showModal = true)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="size-4"
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
			Add location
		</Button>
	</div>
{/if}

<Modal bind:open={showModal}>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Add location</p>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
		class="mt-2"
	>
		<div class="flex gap-2">
			<Input type="text" class="flex-1" bind:value={searchText} />
			<Button type="submit" disabled={searching || !searchText.trim()}>
				{searching ? 'Searching...' : 'Search'}
			</Button>
		</div>
	</form>

	{#if error}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if result}
		<div
			class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 mt-4 overflow-hidden rounded-xl border p-4"
		>
			<div class="flex items-start gap-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="text-base-500 mt-0.5 size-5 shrink-0"
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
				<div class="min-w-0 flex-1">
					<p class="text-base-900 dark:text-base-50 font-medium">
						{getLocationDisplayString(result.location)}
					</p>
					<p class="text-base-500 dark:text-base-400 mt-0.5 truncate text-xs">
						{result.displayName}
					</p>
				</div>
			</div>
			<div class="mt-4 flex justify-end">
				<Button onclick={confirm}>Use this location</Button>
			</div>
		</div>
	{/if}

	<p class="text-base-400 dark:text-base-500 mt-4 text-xs">
		Geocoding by <a
			href="https://nominatim.openstreetmap.org/"
			class="hover:text-base-600 dark:hover:text-base-400 underline"
			target="_blank">Nominatim</a
		>
		/ &copy;
		<a
			href="https://www.openstreetmap.org/copyright"
			class="hover:text-base-600 dark:hover:text-base-400 underline"
			target="_blank">OpenStreetMap contributors</a
		>
	</p>
</Modal>
