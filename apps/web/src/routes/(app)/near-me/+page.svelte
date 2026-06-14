<script lang="ts">
	import { Button, Input } from '@foxui/core';
	import { EventCard } from '@atmo-dev/events-ui';
	import type { FlatEventRecord } from '$lib/contrail';
	import { loadNearMeEvents } from '$lib/search/near-me.remote';
	import { geocodeQuery } from '$lib/search/geocode.remote';

	let { data } = $props();

	const RADII_KM = [5, 10, 25, 50, 100];

	let status = $state<'idle' | 'locating' | 'loading' | 'ready' | 'denied' | 'error'>('idle');
	let coords = $state<{ lat: number; lng: number } | null>(null);
	let locationLabel = $state<string | null>(null);
	let placeQuery = $state('');
	let geocoding = $state(false);
	let lookupMessage = $state<string | null>(null);
	let radiusKm = $state(25);
	let events = $state<FlatEventRecord[]>([]);
	let handles = $state<Record<string, string>>({});
	let distances = $state<Record<string, number>>({});
	let cursor = $state<string | null>(null);
	let loadingMore = $state(false);

	function formatDistance(meters: number | undefined): string | null {
		if (meters === undefined) return null;
		if (meters < 1000) return `${Math.round(meters)} m`;
		const km = meters / 1000;
		return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
	}

	async function fetchPage(reset: boolean) {
		if (!coords) return;
		try {
			const page = await loadNearMeEvents({
				lat: coords.lat,
				lng: coords.lng,
				radiusMeters: radiusKm * 1000,
				...(reset || !cursor ? {} : { cursor })
			});
			events = reset ? page.events : [...events, ...page.events];
			handles = { ...handles, ...page.handles };
			distances = { ...distances, ...page.distances };
			cursor = page.cursor;
			status = 'ready';
		} catch (err) {
			console.error('near-me query failed:', err);
			status = 'error';
		}
	}

	function locate() {
		status = 'locating';
		lookupMessage = null;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
				locationLabel = null;
				status = 'loading';
				fetchPage(true);
			},
			(err) => {
				status = err.code === err.PERMISSION_DENIED ? 'denied' : 'error';
			},
			{ maximumAge: 60_000, timeout: 15_000 }
		);
	}

	async function lookupPlace(e: Event) {
		e.preventDefault();
		const q = placeQuery.trim();
		if (!q || geocoding) return;
		lookupMessage = null;
		geocoding = true;
		try {
			const match = await geocodeQuery({ q });
			if (!match) {
				lookupMessage = `No match for "${q}". Try adding a city or state.`;
				return;
			}
			coords = { lat: match.lat, lng: match.lng };
			locationLabel = match.label;
			status = 'loading';
			await fetchPage(true);
		} catch (err) {
			console.error('geocode failed:', err);
			lookupMessage = 'Location lookup failed. Try again.';
		} finally {
			geocoding = false;
		}
	}

	function changeRadius(km: number) {
		radiusKm = km;
		if (coords) {
			status = 'loading';
			fetchPage(true);
		}
	}

	async function loadMore() {
		if (!cursor || loadingMore) return;
		loadingMore = true;
		try {
			await fetchPage(false);
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>Events Near Me</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-6 text-2xl font-bold">Events Near Me</h1>

	{#if !data.available}
		<p class="text-base-500 py-8 text-center">
			Location search isn't available on this deployment.
		</p>
	{:else}
		<div class="mb-8 space-y-3">
			<div class="flex flex-wrap items-center gap-3">
				<Button onclick={locate} disabled={status === 'locating' || status === 'loading'}>
					{status === 'locating'
						? 'Locating…'
						: coords
							? 'Update my location'
							: 'Use my location'}
				</Button>
				<span class="text-base-500 text-sm">or</span>
				<form onsubmit={lookupPlace} class="flex min-w-64 flex-1 gap-2">
					<Input
						type="text"
						bind:value={placeQuery}
						placeholder="Address, city, or zip code"
						class="flex-1"
					/>
					<Button type="submit" disabled={!placeQuery.trim() || geocoding || status === 'loading'}>
						{geocoding ? 'Finding…' : 'Find'}
					</Button>
				</form>
				<label class="text-base-700 dark:text-base-300 flex items-center gap-2 text-sm">
					within
					<select
						class="bg-base-100 dark:bg-base-800 text-base-900 dark:text-base-50 rounded-lg px-2 py-1.5"
						value={radiusKm}
						onchange={(e) => changeRadius(Number(e.currentTarget.value))}
					>
						{#each RADII_KM as km (km)}
							<option value={km}>{km} km</option>
						{/each}
					</select>
				</label>
			</div>
			{#if lookupMessage}
				<p class="text-base-500 text-sm">{lookupMessage}</p>
			{/if}
			{#if status === 'ready' && locationLabel}
				<p class="text-base-500 truncate text-sm">Showing events near {locationLabel}</p>
			{/if}
			<!-- Nominatim/OpenStreetMap usage policy requires displayed attribution
			     for geocoded results; the place lookup above is the only consumer. -->
			<p class="text-base-400 dark:text-base-500 text-xs">
				Address search by
				<a
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noopener noreferrer"
					class="underline">OpenStreetMap</a
				>
			</p>
		</div>

		{#if status === 'denied'}
			<p class="text-base-500 py-8 text-center">
				Location permission was denied. You can enter an address or zip code instead.
			</p>
		{:else if status === 'error'}
			<p class="text-base-500 py-8 text-center">Something went wrong — try again.</p>
		{:else if status === 'loading'}
			<p class="text-base-500 py-8 text-center">Finding events…</p>
		{:else if status === 'ready'}
			{#if events.length === 0}
				<p class="text-base-500 py-8 text-center">No events within {radiusKm} km.</p>
			{:else}
				<div class="grid gap-6 sm:grid-cols-2">
					{#each events as event (event.uri)}
						<div>
							<EventCard {event} actor={handles[event.did]} />
							{#if formatDistance(distances[event.uri])}
								<p class="text-base-500 mt-1 text-xs">
									{formatDistance(distances[event.uri])} away
								</p>
							{/if}
						</div>
					{/each}
				</div>
				{#if cursor}
					<div class="mt-8 text-center">
						<button
							onclick={loadMore}
							disabled={loadingMore}
							class="bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50 hover:bg-base-300 dark:hover:bg-base-700 inline-block rounded-xl px-5 py-2 text-sm font-medium transition-colors"
						>
							{loadingMore ? 'Loading...' : 'Load more'}
						</button>
					</div>
				{/if}
			{/if}
		{/if}
	{/if}
</div>
