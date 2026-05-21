<script lang="ts" module>
	export const createEventModalState = $state({
		open: false,
		show() {
			this.open = true;
		},
		hide() {
			this.open = false;
		}
	});

	const IMPORT_STORAGE_KEY = 'atmo:event-import-prefill';

	export function readPendingImportPrefill() {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.sessionStorage.getItem(IMPORT_STORAGE_KEY);
			if (!raw) return null;
			window.sessionStorage.removeItem(IMPORT_STORAGE_KEY);
			return JSON.parse(raw) as PendingImportPrefill;
		} catch {
			return null;
		}
	}

	export type PendingImportPrefill = {
		name?: string;
		description?: string;
		startsAt?: string;
		endsAt?: string;
		timezone?: string;
		mode?: 'inperson' | 'virtual' | 'hybrid';
		location?: { street?: string; locality?: string; region?: string; country?: string };
		links?: Array<{ uri: string; name: string }>;
		additionalData?: Record<string, unknown>;
		imageDataUrl?: string;
	};
</script>

<script lang="ts">
	import { Button, Checkbox, Input, Modal } from '@foxui/core';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { EventImportPrefill } from '$lib/import-event';

	type Step = 'choose' | 'import';
	let step: Step = $state('choose');
	let url = $state('');
	let allowAtmoRsvps = $state(true);
	let importing = $state(false);
	let importError: string | null = $state(null);

	function reset() {
		step = 'choose';
		url = '';
		allowAtmoRsvps = true;
		importing = false;
		importError = null;
	}

	function openCreate() {
		createEventModalState.hide();
		reset();
		goto(resolve('/create'));
	}

	function openImport() {
		step = 'import';
	}

	async function submitImport(e: Event) {
		e.preventDefault();
		if (!url.trim()) return;
		importing = true;
		importError = null;
		try {
			const res = await fetch('/api/import-event', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: url.trim() })
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null;
				importError = data?.error ?? `Import failed (HTTP ${res.status}).`;
				return;
			}
			const prefill = (await res.json()) as EventImportPrefill;
			const links = mergeLinks(prefill.links ?? [], prefill.source);
			const pending: PendingImportPrefill = {
				name: prefill.name,
				description: prefill.description,
				startsAt: prefill.startsAt,
				endsAt: prefill.endsAt,
				timezone: prefill.timezone,
				mode: prefill.mode,
				location: prefill.location,
				links,
				additionalData: {
					externalSource: {
						url: prefill.source,
						rsvpMode: allowAtmoRsvps ? 'atmo_too' : 'external_only'
					}
				},
				imageDataUrl: prefill.imageDataUrl
			};
			window.sessionStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(pending));
			createEventModalState.hide();
			reset();
			await goto(resolve('/create'));
		} catch (err) {
			console.error('import-event request failed:', err);
			importError = 'Could not reach the import service.';
		} finally {
			importing = false;
		}
	}

	function handleOpenChange(open: boolean) {
		createEventModalState.open = open;
		if (!open) reset();
	}

	/** Dedupe links by normalized URI and guarantee the source appears exactly once. */
	function mergeLinks(
		fromPrefill: Array<{ uri: string; name: string }>,
		source: string
	): Array<{ uri: string; name: string }> {
		const normalize = (u: string) => {
			try {
				const url = new URL(u);
				const path = url.pathname.replace(/\/+$/, '');
				return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
			} catch {
				return u.replace(/\/+$/, '');
			}
		};
		const out: Array<{ uri: string; name: string }> = [];
		const seen = new Set<string>();
		const sourceKey = normalize(source);
		for (const l of fromPrefill) {
			const key = normalize(l.uri);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(key === sourceKey ? { uri: l.uri, name: 'Original event' } : l);
		}
		if (!seen.has(sourceKey)) {
			out.push({ uri: source, name: 'Original event' });
		}
		return out;
	}
</script>

<Modal bind:open={() => createEventModalState.open, handleOpenChange}>
	<div class="space-y-5">
		{#if step === 'choose'}
			<div class="space-y-1">
				<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Create event</h2>
				<p class="text-base-600 dark:text-base-400 text-sm">
					Start from scratch or pull details from another platform.
				</p>
			</div>

			<div class="grid gap-3">
				<button
					type="button"
					class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 hover:border-base-300 dark:hover:border-base-600 hover:bg-base-200 dark:hover:bg-base-950 cursor-pointer rounded-xl border p-4 text-left transition-colors"
					onclick={openCreate}
				>
					<div class="text-base-900 dark:text-base-50 text-sm font-medium">Create new event</div>
					<div class="text-base-600 dark:text-base-400 mt-1 text-xs">
						Fill in the details yourself.
					</div>
				</button>

				<button
					type="button"
					class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 hover:border-base-300 dark:hover:border-base-600 hover:bg-base-200 dark:hover:bg-base-950 cursor-pointer rounded-xl border p-4 text-left transition-colors"
					onclick={openImport}
				>
					<div class="text-base-900 dark:text-base-50 text-sm font-medium">
						Import event from somewhere else
					</div>
					<div class="text-base-600 dark:text-base-400 mt-1 text-xs">
						Paste a Luma, Meetup, Eventbrite or Partiful link.
					</div>
				</button>
			</div>
		{:else}
			<form class="space-y-4" onsubmit={submitImport}>
				<div class="space-y-1">
					<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Import event</h2>
					<p class="text-base-600 dark:text-base-400 text-sm">
						We'll try to autofill the title, date, location and description.
					</p>
				</div>

				<div class="space-y-2">
					<label
						for="import-url"
						class="text-base-800 dark:text-base-200 block text-sm font-medium"
					>
						Event URL
					</label>
					<Input
						id="import-url"
						type="url"
						placeholder="https://lu.ma/..."
						bind:value={url}
						required
						autofocus
						disabled={importing}
						class="w-full"
					/>
				</div>

				<label class="flex items-start gap-3">
					<Checkbox bind:checked={allowAtmoRsvps} disabled={importing} class="mt-0.5" />
					<span class="text-sm">
						<span class="text-base-900 dark:text-base-50 block font-medium">
							Also accept RSVPs on atmo
						</span>
						<span class="text-base-600 dark:text-base-400 mt-0.5 block text-xs">
							If off, we'll just list the event and link out to the original page.
						</span>
					</span>
				</label>

				{#if importError}
					<p class="text-sm text-red-600 dark:text-red-400">{importError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="secondary"
						onclick={() => (step = 'choose')}
						disabled={importing}
					>
						Back
					</Button>
					<Button type="submit" disabled={importing || !url.trim()}>
						{importing ? 'Importing...' : 'Import'}
					</Button>
				</div>
			</form>
		{/if}
	</div>
</Modal>
