<script lang="ts">
	import EventCard from '../src/EventCard.svelte';
	import { event } from './fixtures.js';
	const names = [
		'Small web, big ideas',
		'A walk, without a plan',
		'Sunday side projects',
		'Building on the Atmosphere',
		'Indie web meetup',
		'An evening of tiny demos'
	];
</script>

<div class="atmo mx-auto max-w-3xl px-6 py-8">
	<h1 class="mb-6 text-2xl font-semibold tracking-tight">Upcoming events</h1>
	<div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
		{#each names as name, i (name)}<EventCard
				event={{ ...event, name, rkey: `test-${i}` }}
				actor="host.example.com"
			/>{/each}
	</div>
</div>
