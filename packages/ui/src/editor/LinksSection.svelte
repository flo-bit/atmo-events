<script lang="ts">
	import { Link as LinkIcon, Plus, X } from '@sketchyicons/svelte';
	import { Button, Icon, Input, Popover } from '@atmo-dev/kit';
	import { validateLink } from '../cal/helper.js';

	type Link = { uri: string; name: string };

	let { links = $bindable() }: { links: Link[] } = $props();

	let showPopup = $state(false);
	let newUri = $state('');
	let newName = $state('');
	let error = $state('');

	function addLink() {
		const raw = newUri.trim();
		if (!raw) return;
		const uri = validateLink(raw);
		if (!uri) {
			error = 'Please enter a valid URL';
			return;
		}
		links.push({ uri, name: newName.trim() });
		newUri = '';
		newName = '';
		error = '';
		showPopup = false;
	}

	function removeLink(index: number) {
		links.splice(index, 1);
	}

	function cancel() {
		showPopup = false;
		error = '';
		newUri = '';
		newName = '';
	}
</script>

<div>
	<p class="text-muted mb-4 text-xs font-semibold tracking-wider uppercase">Links</p>
	<div class="space-y-3">
		{#each links as link, i (i)}
			<div class="group flex items-center gap-1.5">
				<Icon img={LinkIcon} size={14} class="text-base-700 dark:text-base-300 shrink-0" />
				<span class="text-base-700 dark:text-base-300 truncate text-sm">
					{link.name || link.uri.replace(/^https?:\/\//, '')}
				</span>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => removeLink(i)}
					aria-label={`Remove ${link.name || link.uri}`}
					class="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				>
					<Icon img={X} size={14} />
				</Button>
			</div>
		{/each}
	</div>

	<div class="mt-3">
		<Popover
			bind:open={showPopup}
			side="bottom"
			sideOffset={8}
			class="w-64 p-3"
			aria-label="Add event link"
		>
			{#snippet trigger({ props })}
				<Button {...props} size="sm">
					<Icon img={Plus} size={16} />
					Add link
				</Button>
			{/snippet}
			<Input
				type="url"
				bind:value={newUri}
				placeholder="https://..."
				aria-label="Link URL"
				class="mb-2"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addLink();
					}
				}}
			/>
			<Input
				type="text"
				bind:value={newName}
				placeholder="Label (optional)"
				aria-label="Link label"
				class="mb-2"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addLink();
					}
				}}
			/>
			{#if error}
				<p class="mb-2 text-xs text-red-500">{error}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button>
				<Button onclick={addLink} size="sm" disabled={!newUri.trim()}>Add</Button>
			</div>
		</Popover>
	</div>
</div>
