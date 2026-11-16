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
			class="border-base-300 dark:bg-base-950 hover:border-accent-400 dark:hover:border-accent-600 flex items-center gap-4 rounded-xl border bg-[color-mix(in_srgb,var(--base-100)_75%,var(--base-200))] p-5 shadow-[inset_0_2px_4px_color-mix(in_srgb,var(--base-950)_8%,transparent),inset_0_5px_12px_color-mix(in_srgb,var(--base-950)_2%,transparent)] transition-colors dark:border-[color-mix(in_srgb,var(--base-800)_80%,var(--base-950))] dark:shadow-[inset_0_2px_4px_#0006,inset_0_5px_12px_#0002]"
		>
			<Icon img={Handshake} size={28} />
			<div class="min-w-0 flex-1">
				<h2 class="font-semibold">Meet</h2>
				<p class="text-base-600 dark:text-base-400 mt-1 text-sm">
					Scan a QR code to remember someone you met.
				</p>
			</div>
			<Icon img={ArrowRight} size={20} />
		</a>
	</div>
</div>
