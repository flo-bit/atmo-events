<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { Link, MapPin } from '@sketchyicons/svelte';
	import { getPhysicalLocationLines, type LocationData } from './locations.js';

	let { locations }: { locations: LocationData[] } = $props();
	let physicalLines = $derived(getPhysicalLocationLines(locations));
	let links = $derived(locations.filter((location) => location.kind === 'uri'));
</script>

{#if physicalLines.length || links.length}
	<ul class="mb-6 space-y-4" aria-label="Event locations">
		{#if physicalLines.length}
			<li class="flex min-w-0 items-center gap-4">
				<div
					class="rounded-ui bg-recess text-muted flex size-12 shrink-0 items-center justify-center [box-shadow:var(--ui-recess-shadow)]"
				>
					<Icon img={MapPin} size={22} />
				</div>
				<div class="min-w-0 [overflow-wrap:anywhere]">
					{#each physicalLines as line}
						<p class={line.muted ? 'text-muted text-sm' : 'text-ink font-semibold'}>
							<svelte:element
								this={line.href ? 'a' : 'span'}
								href={line.href}
								target={line.href ? '_blank' : undefined}
								rel={line.href ? 'noopener noreferrer' : undefined}
								class={line.href ? 'transition-opacity hover:opacity-80' : undefined}
								>{line.label}</svelte:element
							>
						</p>
					{/each}
				</div>
			</li>
		{/if}
		{#each links as location}
			<li>
				<svelte:element
					this={location.href ? 'a' : 'div'}
					href={location.href}
					target={location.href ? '_blank' : undefined}
					rel={location.href ? 'noopener noreferrer' : undefined}
					class="rounded-ui flex min-w-0 items-center gap-4 {location.href
						? 'transition-opacity hover:opacity-80'
						: ''}"
				>
					<div
						class="rounded-ui bg-recess text-muted flex size-12 shrink-0 items-center justify-center [box-shadow:var(--ui-recess-shadow)]"
					>
						<Icon img={Link} size={22} />
					</div>
					<div class="min-w-0 [overflow-wrap:anywhere]">
						<p class="text-ink font-semibold">{location.label}</p>
						{#if location.detail}
							<p class="text-muted text-sm">{location.detail}</p>
						{/if}
					</div>
				</svelte:element>
			</li>
		{/each}
	</ul>
{/if}
