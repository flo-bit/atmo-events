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
	import { tick } from 'svelte';
	import { Button, Checkbox, Icon, Input, Modal } from '@atmo-dev/kit';
	import { ArrowLeft, ArrowRight, CalendarPlus, Link } from '@sketchyicons/svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { EventImportPrefill } from '#lib/import-event.js';

	type Step = 'choose' | 'import';
	let step: Step = $state('choose');
	let url = $state('');
	let allowAtmoRsvps = $state(true);
	let importing = $state(false);
	let importError: string | null = $state(null);
	const id = $props.id();
	let importButton: HTMLButtonElement | undefined = $state();

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
		goto(resolve('create'));
	}

	async function openImport() {
		step = 'import';
		await tick();
		document.getElementById(`${id}-url`)?.focus();
	}

	async function backToChoices() {
		step = 'choose';
		await tick();
		importButton?.focus();
	}

	async function submitImport(e: Event) {
		e.preventDefault();
		if (importing || !url.trim()) return;
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
			await goto(resolve('create'));
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

<Modal
	bind:open={() => createEventModalState.open, handleOpenChange}
	title={step === 'choose' ? 'Create event' : 'Import event'}
	description={step === 'import' ? 'Import the details, then review before publishing.' : undefined}
	dismissible={!importing}
	class="max-w-md [&>header]:mb-4"
>
	{#if step === 'choose'}
		<div class="-mx-2">
			<button
				type="button"
				class="group hover:bg-accent-soft rounded-ui flex w-full cursor-pointer items-center gap-4 px-3 py-4 text-left transition-colors"
				onclick={openCreate}
			>
				<Icon img={CalendarPlus} size={24} class="text-action shrink-0" />
				<span class="min-w-0 flex-1">
					<span class="text-ink block text-sm font-medium">Start from scratch</span>
					<span class="text-muted mt-1 block text-[.8125rem] leading-relaxed">
						Add your event details.
					</span>
				</span>
				<Icon img={ArrowRight} size={18} class="text-muted group-hover:text-action shrink-0" />
			</button>

			<div class="border-line mx-3 my-1 border-t"></div>

			<button
				bind:this={importButton}
				type="button"
				class="group hover:bg-recess rounded-ui flex w-full cursor-pointer items-center gap-4 px-3 py-4 text-left transition-colors"
				onclick={openImport}
			>
				<Icon img={Link} size={24} class="text-muted shrink-0" />
				<span class="min-w-0 flex-1">
					<span class="text-ink block text-sm font-medium">Import from a link</span>
					<span class="text-muted mt-1 block text-[.8125rem] leading-relaxed">
						Luma, Meetup, Eventbrite, and more.
					</span>
				</span>
				<Icon img={ArrowRight} size={18} class="text-muted group-hover:text-ink shrink-0" />
			</button>
		</div>
	{:else}
		<form class="space-y-6" onsubmit={submitImport} aria-busy={importing}>
			<div class="space-y-2">
				<label for={`${id}-url`} class="text-ink block text-sm font-medium">Event link</label>
				<Input
					id={`${id}-url`}
					type="url"
					placeholder="https://lu.ma/..."
					bind:value={url}
					required
					disabled={importing}
					aria-describedby={`${id}-platforms`}
					class="w-full"
				/>
				<p id={`${id}-platforms`} class="text-muted text-xs leading-relaxed">
					Works with Luma, Meetup, Eventbrite, Partiful, guild.host, and Resident Advisor.
				</p>
			</div>

			<label class="flex cursor-pointer items-start gap-3">
				<Checkbox bind:checked={allowAtmoRsvps} disabled={importing} class="mt-0.5" />
				<span>
					<span class="text-ink block text-sm font-medium">Also accept RSVPs on atmo</span>
					<span class="text-muted mt-1 block text-xs leading-relaxed">
						Turn off to send guests to the original event to RSVP.
					</span>
				</span>
			</label>

			{#if importError}
				<p role="alert" class="text-sm text-red-600 dark:text-red-400">{importError}</p>
			{/if}

			<div class="flex items-center justify-between gap-3">
				<Button type="button" variant="ghost" onclick={backToChoices} disabled={importing}>
					<Icon img={ArrowLeft} size={16} />
					Back
				</Button>
				<Button type="submit" loading={importing} disabled={!url.trim()}>
					{importing ? 'Importing…' : 'Import event'}
				</Button>
			</div>
		</form>
	{/if}
</Modal>
