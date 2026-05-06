<script lang="ts">
	import { Button, Input, PopoverContent, PopoverRoot, PopoverTrigger } from '@foxui/core';
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
	<p class="text-base-500 dark:text-base-400 mb-4 text-xs font-semibold tracking-wider uppercase">
		Links
	</p>
	<div class="space-y-3">
		{#each links as link, i (i)}
			<div class="group flex items-center gap-1.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="text-base-700 dark:text-base-300 size-3.5 shrink-0"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
					/>
				</svg>
				<span class="text-base-700 dark:text-base-300 truncate text-sm">
					{link.name || link.uri.replace(/^https?:\/\//, '')}
				</span>
				<Button
					variant="ghost"
					size="iconSm"
					onclick={() => removeLink(i)}
					class="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				>
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
		{/each}
	</div>

	<div class="mt-3">
		<PopoverRoot bind:open={showPopup}>
			<PopoverTrigger>
				<Button size="sm">
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
							d="M12 4.5v15m7.5-7.5h-15"
						/>
					</svg>
					Add link
				</Button>
			</PopoverTrigger>
			<PopoverContent side="bottom" sideOffset={8} class="w-64 p-3">
				<Input
					type="url"
					bind:value={newUri}
					placeholder="https://..."
					variant="secondary"
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
					variant="secondary"
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
			</PopoverContent>
		</PopoverRoot>
	</div>
</div>
