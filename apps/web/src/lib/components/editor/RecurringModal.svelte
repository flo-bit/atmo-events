<script lang="ts">
	import { Button, Checkbox, Input, Modal, ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import { parseDateTime } from '@internationalized/date';
	import * as TID from '@atcute/tid';
	import { notifyContrailOfUpdate } from '$lib/contrail';
	import type { FlatEventRecord } from '$lib/contrail';
	import type { EventLocation, EventMode } from './types';
	import { buildThumbnailMedia, renderPresetThumbnail } from './save';
	import { hashSeed } from '$lib/components/thumbnails/designs';
	import type { EditorAdapter, EditorViewer } from './adapter';

	let {
		open = $bindable(),
		rkey,
		eventData,
		isNew,
		name,
		startsAt,
		endsAt,
		mode,
		timezone,
		description,
		links,
		location,
		thumbnailDateStr,
		thumbnailFile,
		thumbnailChanged,
		selectedPreset,
		accent,
		adapter,
		viewer
	}: {
		open: boolean;
		rkey: string;
		eventData: FlatEventRecord | null;
		isNew: boolean;
		name: string;
		startsAt: string;
		endsAt: string;
		mode: EventMode;
		timezone: string;
		description: string;
		links: Array<{ uri: string; name: string }>;
		location: EventLocation | null;
		thumbnailDateStr: string;
		thumbnailFile: File | null;
		thumbnailChanged: boolean;
		selectedPreset: string | null;
		accent: string;
		adapter: EditorAdapter;
		viewer: EditorViewer;
	} = $props();

	let interval = $state(1);
	let unit: 'days' | 'weeks' | 'months' | 'years' = $state('weeks');
	let count = $state(4);
	let numberInTitle = $state(false);
	let creating = $state(false);
	let errorMsg: string | null = $state(null);
	let created = $state(0);

	let titleNumberMatch = $derived(name.match(/#?(\d+)\s*$/));
	let detectedStartNumber = $derived(titleNumberMatch ? parseInt(titleNumberMatch[1]) : null);

	$effect(() => {
		if (detectedStartNumber !== null) numberInTitle = true;
	});

	async function handleCreate() {
		if (!name.trim() || !startsAt || !viewer.isLoggedIn || !viewer.did) return;

		creating = true;
		errorMsg = null;
		created = 0;

		try {
			// Recurring instances advance by wall-clock duration (e.g. "every week
			// at 10am"), so operate on CalendarDateTime — not absolute instants —
			// to preserve the wall time across DST transitions.
			const baseStart = parseDateTime(startsAt);
			const baseEnd = endsAt ? parseDateTime(endsAt) : null;
			const durationMs = baseEnd
				? baseEnd.toDate(timezone).getTime() - baseStart.toDate(timezone).getTime()
				: 0;
			const baseName =
				numberInTitle && titleNumberMatch
					? name.replace(/#?\d+\s*$/, '').trimEnd()
					: name.trim();
			const startNum = detectedStartNumber ?? 1;
			const hasHash = titleNumberMatch ? titleNumberMatch[0].includes('#') : false;

			// Generate thumbnail from preset if selected and no custom upload.
			let fileForUpload = thumbnailFile;
			let hasNewThumbnail = thumbnailChanged;
			if (selectedPreset && !fileForUpload) {
				const rendered = await renderPresetThumbnail({
					design: selectedPreset,
					seed: hashSeed(rkey),
					name,
					dateStr: thumbnailDateStr,
					accent
				});
				if (rendered) {
					fileForUpload = rendered;
					hasNewThumbnail = true;
				}
			}

			const existingMedia = (eventData?.media ?? []) as Array<Record<string, unknown>>;
			const media = await buildThumbnailMedia({
				isNew,
				thumbnailChanged: hasNewThumbnail,
				thumbnailFile: fileForUpload,
				existingMedia,
				uploadBlob: (blob) =>
					adapter.uploadBlob(blob) as unknown as Promise<Record<string, unknown>>
			});

			const parentUri = `at://${viewer.did}/community.lexicon.calendar.event/${rkey}`;

			for (let i = 0; i < count; i++) {
				const offset = i + 1;
				const step = offset * interval;
				const eventStart =
					unit === 'days'
						? baseStart.add({ days: step })
						: unit === 'weeks'
							? baseStart.add({ weeks: step })
							: unit === 'months'
								? baseStart.add({ months: step })
								: baseStart.add({ years: step });

				const eventStartIso = eventStart.toDate(timezone).toISOString();
				// Preserve the original absolute duration (handles events that
				// span midnight or odd wall-clock lengths correctly).
				const eventEndIso = durationMs
					? new Date(eventStart.toDate(timezone).getTime() + durationMs).toISOString()
					: null;

				let eventName = baseName;
				if (numberInTitle) {
					const num = startNum + (i + 1);
					eventName = hasHash ? `${baseName} #${num}` : `${baseName} ${num}`;
				}

				const newRkey = TID.now();
				const record: Record<string, unknown> = {
					$type: 'community.lexicon.calendar.event',
					createdWith: 'https://atmo.rsvp',
					name: eventName,
					mode: `community.lexicon.calendar.event#${mode}`,
					status: 'community.lexicon.calendar.event#scheduled',
					startsAt: eventStartIso,
					timezone,
					createdAt: new Date().toISOString(),
					recurringEventOf: parentUri
				};

				const trimmedDescription = description.trim();
				if (trimmedDescription) record.description = trimmedDescription;
				if (eventEndIso) record.endsAt = eventEndIso;
				if (media) record.media = media;
				if (links.length > 0) record.uris = links;
				if (location) {
					record.locations = [
						{
							$type: 'community.lexicon.location.address',
							...location
						}
					];
				}

				try {
					const result = await adapter.putRecord({
						collection: 'community.lexicon.calendar.event',
						rkey: newRkey,
						record
					});
					await notifyContrailOfUpdate(result.uri);
					created = i + 1;
				} catch {
					errorMsg = `Failed to create event ${i + 1}. Stopping.`;
					return;
				}
			}

			open = false;
		} catch (e) {
			console.error('Failed to create recurring events:', e);
			errorMsg = 'Failed to create recurring events. Please try again.';
		} finally {
			creating = false;
		}
	}
</script>

<Modal bind:open>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Add recurring events</p>
	<p class="text-base-500 dark:text-base-400 mt-1 text-sm">
		Create multiple copies of this event at regular intervals.
	</p>

	<div class="mt-4 space-y-4">
		<div>
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">
				Number of events to create
			</label>
			<Input type="number" bind:value={count} min={1} max={52} class="w-24" />
		</div>

		<div>
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">
				Repeat every
			</label>
			<div class="flex items-center gap-2">
				<Input type="number" bind:value={interval} min={1} max={99} class="w-20" />
				<ToggleGroup type="single" bind:value={unit}>
					<ToggleGroupItem value="days">days</ToggleGroupItem>
					<ToggleGroupItem value="weeks">weeks</ToggleGroupItem>
					<ToggleGroupItem value="months">months</ToggleGroupItem>
					<ToggleGroupItem value="years">years</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</div>

		<div>
			<div class="flex items-center gap-2">
				<Checkbox bind:checked={numberInTitle} sizeVariant="sm" />
				<span class="text-base-700 dark:text-base-300 text-sm font-medium">Number in title</span>
			</div>
			<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
				{#if numberInTitle && detectedStartNumber !== null}
					Titles will count up from #{detectedStartNumber + 1}
				{:else if numberInTitle}
					A number will be appended to each title
				{:else}
					Append a number to each event title
				{/if}
			</p>
		</div>
	</div>

	{#if errorMsg}
		<p class="mt-4 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
	{/if}

	{#if creating && created > 0}
		<p class="text-base-500 dark:text-base-400 mt-4 text-sm">
			Created {created} of {count} events...
		</p>
	{/if}

	{#if created > 0 && !creating}
		<p class="mt-4 text-sm text-green-600 dark:text-green-400">
			Successfully created {created} recurring events!
		</p>
	{/if}

	<div class="mt-4 flex justify-end gap-2">
		<Button variant="secondary" onclick={() => (open = false)} disabled={creating}>
			{created > 0 && !creating ? 'Close' : 'Cancel'}
		</Button>
		{#if !created || creating}
			<Button onclick={handleCreate} disabled={creating || count < 1}>
				{creating ? `Creating...` : `Create ${count} event${count === 1 ? '' : 's'}`}
			</Button>
		{/if}
	</div>
</Modal>
