<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { resolve } from '$app/paths';
	import { Handshake, ArrowRight } from '@sketchyicons/svelte';
</script>

<svelte:head><title>Tools · atmo.rsvp</title></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="mb-8 text-2xl font-semibold tracking-tight">Tools</h1>
	<div class="grid gap-4 md:grid-cols-2">
		<a
			href={resolve('/(app)/tools/meet')}
			class="border-line bg-recess hover:border-accent-400 dark:hover:border-accent-600 flex items-center gap-4 rounded-xl border p-5 shadow-(--ui-recess-shadow) transition-colors"
		>
			<Icon img={Handshake} size={28} />
			<div class="min-w-0 flex-1">
				<h2 class="font-semibold">Meet</h2>
				<p class="text-muted mt-1 text-sm">Scan a QR code to remember someone you met.</p>
			</div>
			<Icon img={ArrowRight} size={20} />
		</a>
	</div>
</div>
