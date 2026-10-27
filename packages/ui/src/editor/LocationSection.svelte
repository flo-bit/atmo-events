<script lang="ts">
	import { MapPin, X } from '@sketchyicons/svelte';
	import { Button, Icon, Input, Modal } from '@atmo-dev/kit';
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
			const country = addr.country_code || addr.country || '';

			result = {
				displayName: (data.label as string) || q,
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
			<Icon img={MapPin} size={20} class="text-base-900 dark:text-base-200" />
		</div>
		<p class="text-base-900 dark:text-base-50 flex-1 font-semibold">
			{getLocationDisplayString(location)}
		</p>
		<Button
			variant="ghost"
			size="icon"
			aria-label="Remove location"
			onclick={remove}
			class="shrink-0"
		>
			<Icon img={X} size={14} />
		</Button>
	</div>
{:else}
	<div class="mb-6">
		<Button variant="secondary" onclick={() => (showModal = true)}>
			<Icon img={MapPin} size={16} />
			Add location
		</Button>
	</div>
{/if}

<Modal bind:open={showModal} title="Event location">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
		class="mt-2"
	>
		<div class="flex gap-2">
			<Input
				type="text"
				aria-label="Search location"
				class="min-w-0 flex-1"
				bind:value={searchText}
			/>
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
				<Icon img={MapPin} size={20} class="text-base-500 mt-0.5 shrink-0" />
				<div class="min-w-0 flex-1">
					<p class="text-base-900 dark:text-base-50 font-medium">
						{getLocationDisplayString(result.location)}
					</p>
					<p class="text-muted mt-0.5 truncate text-xs">
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
