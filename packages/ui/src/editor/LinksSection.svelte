<script lang="ts">
	import { Camera, Link as LinkIcon, Plus, Video, X } from '@sketchyicons/svelte';
	import { Button, Icon, Input, Popover } from '@atmo-dev/kit';
	import { validateLink } from '../cal/helper.js';
	import { eventStreamLink, isLinkedRecord, parseGrainLink } from '../linked-records.js';
	import type { EditorAdapter, EditorViewer } from './adapter.js';
	import LinkedRecordsPicker from './LinkedRecordsPicker.svelte';

	type Link = { uri: string; name: string };
	let {
		links = $bindable(),
		adapter,
		viewer
	}: { links: Link[]; adapter: EditorAdapter; viewer: EditorViewer } = $props();
	let showPopup = $state(false);
	let newUri = $state('');
	let newName = $state('');
	let error = $state('');
	let ordinary = $derived(links.filter((l) => !isLinkedRecord(l)));
	let linked = $derived(links.filter(isLinkedRecord));

	function addLink() {
		const raw = newUri.trim();
		if (!raw) return;
		const uri = validateLink(raw);
		if (!uri) {
			error = 'Please enter a valid URL';
			return;
		}
		if (links.some((link) => link.uri === uri)) {
			error = 'This link is already added.';
			return;
		}
		const grain = parseGrainLink(uri),
			stream = eventStreamLink(uri);
		// Keep one stream even when it was added through the generic URL input.
		if (stream && links.some((l) => eventStreamLink(l.uri))) {
			error = 'Use the Streamplace picker to replace the current stream.';
			return;
		}
		links = [
			...links,
			{
				uri,
				name:
					newName.trim() ||
					(grain ? 'Grain photo album' : stream ? `Streamplace · ${stream.actor}` : '')
			}
		];
		cancel();
	}
	function removeLink(link: Link) {
		links = links.filter((l) => l !== link);
	}
	function cancel() {
		showPopup = false;
		error = '';
		newUri = '';
		newName = '';
	}
</script>

{#snippet row(link: Link, provider?: 'grain' | 'stream')}
	<div class="group flex items-center gap-2">
		<Icon
			img={provider === 'grain' ? Camera : provider === 'stream' ? Video : LinkIcon}
			size={16}
			class="text-muted shrink-0"
		/>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm">
				{link.name ||
					(provider === 'grain'
						? 'Grain photo album'
						: provider === 'stream'
							? eventStreamLink(link.uri)?.actor
							: link.uri.replace(/^https?:\/\//, ''))}
			</p>
		</div>
		<Button
			variant="ghost"
			size="icon"
			onclick={() => removeLink(link)}
			aria-label={`Remove ${link.name || link.uri}`}
			class="shrink-0"><Icon img={X} size={14} /></Button
		>
	</div>
{/snippet}

<div>
	{#if ordinary.length}
		<p class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">Links</p>
		<div class="mb-4 space-y-3">
			{#each ordinary as link, i (i)}{@render row(link)}{/each}
		</div>
	{/if}
	{#if linked.length}
		<p class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">Linked records</p>
		<div class="mb-4 space-y-3">
			{#each linked as link, i (i)}{@render row(
					link,
					parseGrainLink(link.uri) ? 'grain' : 'stream'
				)}{/each}
		</div>
	{/if}
	<div class="flex flex-wrap gap-2">
		<Popover
			bind:open={showPopup}
			side="bottom"
			sideOffset={8}
			class="w-64 p-3"
			aria-label="Add event link"
		>
			{#snippet trigger({ props })}<Button {...props} size="sm"
					><Icon img={Plus} size={16} />Add link</Button
				>{/snippet}
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
			{#if error}<p class="mb-2 text-xs text-red-500" role="alert">{error}</p>{/if}
			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button><Button
					onclick={addLink}
					size="sm"
					disabled={!newUri.trim()}>Add</Button
				>
			</div>
		</Popover>
		<LinkedRecordsPicker bind:links {adapter} {viewer} />
	</div>
</div>
