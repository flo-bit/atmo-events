<script lang="ts">
	import { user } from '$lib/atproto/auth.svelte';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { putRecord, deleteRecord } from '$lib/atproto/methods';
	import { getCDNImageBlobUrl } from '$lib/atproto';
	import { notifyContrailOfUpdate } from '$lib/contrail';
	import {
		Avatar as FoxAvatar,
		Button,
		ToggleGroup,
		ToggleGroupItem
	} from '@foxui/core';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { PlainTextEditor } from '@foxui/text';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import TimezonePicker from '$lib/components/TimezonePicker.svelte';
	import { parseDateTime } from '@internationalized/date';
	import { isoToDatetimeLocalInTz } from '$lib/date-format';
	import type { FlatEventRecord } from '$lib/contrail';
	import ThemeApply from '$lib/components/ThemeApply.svelte';
	import ThemeBackground from '$lib/components/ThemeBackground.svelte';
	import { defaultTheme, randomAccentColor, type EventTheme } from '$lib/theme';

	import type { Readable } from 'svelte/store';
	import { get } from 'svelte/store';
	import type { Editor } from '@tiptap/core';

	import ThumbnailSection from './editor/ThumbnailSection.svelte';
	import LocationSection from './editor/LocationSection.svelte';
	import LinksSection from './editor/LinksSection.svelte';
	import ThemeSection from './editor/ThemeSection.svelte';
	import RecurringModal from './editor/RecurringModal.svelte';
	import {
		stripModePrefix,
		type EventLocation,
		type EventMode,
		type Visibility
	} from './editor/types';
	import { buildEventRecord, buildThumbnailMedia, renderPresetThumbnail } from './editor/save';
	import { DEFAULT_PRESET, hashSeed } from './thumbnails/designs';

	let {
		eventData = null,
		actorDid,
		rkey,
		privateMode = false
	}: {
		eventData: FlatEventRecord | null;
		actorDid: string;
		rkey: string;
		/** If true, save writes into a permissioned space instead of the user's public PDS. */
		privateMode?: boolean;
	} = $props();

	let isNew = $derived(eventData === null);

	let thumbnailChanged = $state(false);

	// svelte-ignore state_referenced_locally
	let name = $state(eventData?.name || '');
	let description = $state('');
	let startsAt = $state('');
	let endsAt = $state('');
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let mode: EventMode = $state('inperson');
	// svelte-ignore state_referenced_locally
	let visibility: Visibility = $state(privateMode && dev ? 'private' : 'public');
	let eventTheme: EventTheme = $state(
		eventData === null
			? { ...defaultTheme, accentColor: randomAccentColor() }
			: { ...defaultTheme }
	);
	let thumbnailFile: File | null = $state(null);
	let thumbnailPreview: string | null = $state(null);
	let selectedPreset: string | null = $state(eventData === null ? DEFAULT_PRESET : null);
	let submitting = $state(false);
	let error: string | null = $state(null);
	let titleEditor: Readable<Editor> | undefined = $state(undefined);

	let location: EventLocation | null = $state(null);
	let locationChanged = $state(false);

	let links: Array<{ uri: string; name: string }> = $state([]);

	let showRecurringModal = $state(false);

	function populateLocationFromEventData() {
		if (!eventData) return;
		if (eventData.locations && eventData.locations.length > 0) {
			const loc = eventData.locations.find(
				(v) => v.$type === 'community.lexicon.location.address'
			) as { street?: string; locality?: string; region?: string; country?: string } | undefined;
			if (loc) {
				const street = loc.street || undefined;
				const locality = loc.locality || undefined;
				const region = loc.region || undefined;
				const country = loc.country || undefined;
				location = {
					...(street && { street }),
					...(locality && { locality }),
					...(region && { region }),
					...(country && { country })
				};
			}
		}
		locationChanged = false;
	}

	function populateThumbnailFromEventData() {
		if (!eventData) return;
		if (eventData.media && eventData.media.length > 0) {
			const media = eventData.media.find((m) => m.role === 'thumbnail');
			if (media?.content) {
				const url = getCDNImageBlobUrl({ did: actorDid, blob: media.content });
				if (url) {
					thumbnailPreview = url;
					thumbnailChanged = false;
				}
			}
		}
	}

	function populateFromEventData() {
		if (!eventData) return;
		name = eventData.name || '';
		description = eventData.description || '';
		// Restore the event's authored timezone first so the wall-clock fields we
		// populate below land in that zone (not the viewer's browser zone).
		if (eventData.timezone) timezone = eventData.timezone;
		startsAt = eventData.startsAt ? isoToDatetimeLocalInTz(eventData.startsAt, timezone) : '';
		endsAt = eventData.endsAt ? isoToDatetimeLocalInTz(eventData.endsAt, timezone) : '';
		mode = eventData.mode ? stripModePrefix(eventData.mode) : 'inperson';
		const prefs = (eventData as unknown as { preferences?: { showInDiscovery?: boolean } })
			.preferences;
		if (privateMode && dev) visibility = 'private';
		else if (prefs && prefs.showInDiscovery === false) visibility = 'unlisted';
		else visibility = 'public';
		links = eventData.uris ? eventData.uris.map((l) => ({ uri: l.uri, name: l.name || '' })) : [];
		if (eventData.theme) eventTheme = { ...eventData.theme };
		populateLocationFromEventData();
		populateThumbnailFromEventData();
	}

	onMount(() => {
		if (!isNew) populateFromEventData();
		if (titleEditor) get(titleEditor)?.commands.focus();
	});

	let hostName = $derived(user.profile?.displayName || user.profile?.handle || user.did || '');

	let thumbnailDateStr = $derived.by(() => {
		if (!startsAt) return '';
		const d = new Date(startsAt);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	});

	// Trim a CalendarDateTime.toString() ("YYYY-MM-DDTHH:mm:ss[.sss]") down to
	// the "YYYY-MM-DDTHH:mm" shape that <input type="datetime-local"> expects.
	function cdtToDatetimeLocal(s: string): string {
		return s.slice(0, 16);
	}

	// Auto-set end date to 1 hour after start if empty
	$effect(() => {
		if (startsAt && !endsAt) {
			endsAt = cdtToDatetimeLocal(parseDateTime(startsAt).add({ hours: 1 }).toString());
		}
	});

	// Auto-adjust end date if start moves past it
	$effect(() => {
		if (startsAt && endsAt) {
			const s = parseDateTime(startsAt);
			const e = parseDateTime(endsAt);
			if (s.compare(e) >= 0) {
				endsAt = cdtToDatetimeLocal(s.add({ hours: 1 }).toString());
			}
		}
	});

	async function handleSubmit() {
		error = null;

		if (!name.trim()) return void (error = 'Name is required.');
		if (!startsAt) return void (error = 'Start date is required.');
		if (!endsAt) return void (error = 'End date is required.');
		if (!user.isLoggedIn || !user.did) return void (error = 'You must be logged in.');

		submitting = true;

		try {
			// Generate thumbnail from preset if selected and no custom upload
			if (selectedPreset && !thumbnailFile) {
				const rendered = await renderPresetThumbnail({
					design: selectedPreset,
					seed: hashSeed(rkey),
					name,
					dateStr: thumbnailDateStr,
					accent: eventTheme.accentColor
				});
				if (rendered) {
					thumbnailFile = rendered;
					thumbnailChanged = true;
				}
			}

			const existingMedia = (eventData?.media ?? []) as Array<Record<string, unknown>>;
			const media = await buildThumbnailMedia({
				isNew,
				thumbnailChanged,
				thumbnailFile,
				existingMedia
			});

			const record = await buildEventRecord({
				eventData,
				isNew,
				name,
				description,
				startsAt,
				endsAt,
				timezone,
				mode,
				visibility,
				theme: eventTheme,
				links,
				location,
				locationChanged,
				media
			});

			if (visibility === 'private') {
				const { createPrivateEvent } = await import('$lib/spaces/server/spaces.remote');
				const { spaceUri, rkey: eventRkey } = await createPrivateEvent({ key: rkey, record });
				const spaceKey = spaceUri.split('/').pop();
				const handle =
					user.profile?.handle && user.profile.handle !== 'handle.invalid'
						? user.profile.handle
						: user.did;
				goto(`/p/${handle}/e/${eventRkey}/s/${spaceKey}?created=true`);
				return;
			}

			const response = await putRecord({
				collection: 'community.lexicon.calendar.event',
				rkey,
				record
			});

			if (response.ok) {
				const eventUri = `at://${user.did}/community.lexicon.calendar.event/${rkey}`;
				await notifyContrailOfUpdate(eventUri);
				const handle =
					user.profile?.handle && user.profile.handle !== 'handle.invalid'
						? user.profile.handle
						: user.did;
				goto(`/p/${handle}/e/${rkey}${isNew ? '?created=true' : ''}`);
			} else {
				error = `Failed to ${isNew ? 'create' : 'save'} event. Please try again.`;
			}
		} catch (e) {
			console.error(`Failed to ${isNew ? 'create' : 'save'} event:`, e);
			error = `Failed to ${isNew ? 'create' : 'save'} event. Please try again.`;
		} finally {
			submitting = false;
		}
	}

	let showDeleteConfirm = $state(false);
	let deleting = $state(false);

	async function handleDelete() {
		deleting = true;
		try {
			await deleteRecord({
				collection: 'community.lexicon.calendar.event',
				rkey
			});
			const eventUri = `at://${user.did}/community.lexicon.calendar.event/${rkey}`;
			await notifyContrailOfUpdate(eventUri);
			const handle =
				user.profile?.handle && user.profile.handle !== 'handle.invalid'
					? user.profile.handle
					: user.did;
			goto(`/p/${handle}`);
		} catch (e) {
			console.error('Failed to delete event:', e);
			error = 'Failed to delete event. Please try again.';
		} finally {
			deleting = false;
			showDeleteConfirm = false;
		}
	}
</script>

<ThemeApply accentColor={eventTheme.accentColor} baseColor={eventTheme.baseColor} />
<ThemeBackground theme={eventTheme} />

<div class="px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-3xl">
		{#if !user.isLoggedIn}
			<div
				class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-900/50 rounded-2xl border p-8 text-center"
			>
				<p class="text-base-600 dark:text-base-400 mb-4">
					Log in to {isNew ? 'create an event' : 'edit this event'}.
				</p>
				<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
			</div>
		{:else}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<!-- Two-column layout mirroring detail page -->
				<div
					class="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr] md:gap-x-10 md:gap-y-6 lg:grid-cols-[16rem_1fr]"
				>
					<ThumbnailSection
						{rkey}
						{name}
						dateStr={thumbnailDateStr}
						accent={eventTheme.accentColor}
						bind:thumbnailFile
						bind:thumbnailPreview
						bind:thumbnailChanged
						bind:selectedPreset
					/>

					<!-- Right column: event details -->
					<div class="order-2 min-w-0 md:order-0 md:col-start-2 md:row-span-5 md:row-start-1">
						<!-- Name -->
						<div class="mb-2 min-h-14">
							<PlainTextEditor
								content={name}
								bind:editor={titleEditor}
								placeholder="Event name"
								onupdate={() => {
									if (titleEditor) {
										const text = get(titleEditor)?.getText() ?? '';
										if (text.includes('\n')) {
											const cleaned = text.replace(/\n/g, ' ');
											get(titleEditor)?.commands.setContent(cleaned);
											name = cleaned;
										} else {
											name = text;
										}
									}
								}}
								class="text-base-900 dark:text-base-50 placeholder:text-base-500 dark:placeholder:text-base-500 w-full text-3xl leading-tight font-bold focus:outline-none sm:text-4xl"
							/>
						</div>

						<!-- Mode toggle -->
						<div class="mb-3">
							<ToggleGroup
								type="single"
								bind:value={
									() => mode,
									(val) => {
										if (val) mode = val;
									}
								}
								class="w-fit"
								size="xs"
							>
								<ToggleGroupItem value="inperson">In Person</ToggleGroupItem>
								<ToggleGroupItem value="virtual">Virtual</ToggleGroupItem>
								<ToggleGroupItem value="hybrid">Hybrid</ToggleGroupItem>
							</ToggleGroup>
						</div>

						<!-- Visibility toggle -->
						<div class="mb-8">
							<ToggleGroup
								type="single"
								bind:value={
									() => visibility,
									(val) => {
										if (val) visibility = val as Visibility;
									}
								}
								class="w-fit"
								size="xs"
								disabled={!isNew && visibility === 'private'}
							>
								<ToggleGroupItem value="public">Public</ToggleGroupItem>
								{#if dev}
									<ToggleGroupItem value="private">Private</ToggleGroupItem>
								{/if}
								<ToggleGroupItem value="unlisted">Unlisted</ToggleGroupItem>
							</ToggleGroup>
							<div class="text-base-500 dark:text-base-400 mt-1.5 text-xs">
								{#if visibility === 'public'}
									Anyone can view and it appears in discovery.
								{:else if visibility === 'private'}
									Only people you add (or who redeem an invite link) can see it.
								{:else}
									Public to anyone with the link, but hidden from discovery.
								{/if}
							</div>
						</div>

						<!-- Date row -->
						<div class="mb-4 flex items-stretch gap-3">
							<div class="flex flex-col gap-2">
								<div class="flex items-center gap-2">
									<span class="text-base-500 dark:text-base-400 w-9 text-sm">Start</span>
									<DateTimePicker bind:value={startsAt} required />
								</div>
								<div class="flex items-center gap-2">
									<span class="text-base-500 dark:text-base-400 w-9 text-sm">End</span>
									<DateTimePicker bind:value={endsAt} minValue={startsAt} referenceTime={startsAt} />
								</div>
							</div>
							<div class="hidden sm:flex">
								<TimezonePicker bind:value={timezone} />
							</div>
						</div>

						<LocationSection bind:location bind:locationChanged />

						<!-- About Event -->
						<div class="mt-8 mb-8">
							<p
								class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
							>
								About
							</p>
							<textarea
								bind:value={description}
								rows={4}
								placeholder="What's this event about? @mentions, #hashtags and links will be detected automatically."
								class="text-base-700 dark:text-base-300 placeholder:text-base-500 dark:placeholder:text-base-500 w-full resize-none border-0 bg-transparent px-0 leading-relaxed focus:border-0 focus:ring-0 focus:outline-none"
								style="field-sizing: content;"
							></textarea>
						</div>

						{#if error}
							<p class="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
						{/if}

						<Button type="submit" disabled={submitting || !name.trim() || !startsAt || !endsAt}>
							{submitting
								? isNew
									? 'Publishing...'
									: 'Saving...'
								: isNew
									? 'Publish Event'
									: 'Save Changes'}
						</Button>
						{#if !isNew}
							<Button
								type="button"
								variant="secondary"
								disabled={submitting || !name.trim() || !startsAt || !endsAt}
								onclick={() => (showRecurringModal = true)}
							>
								Add recurring events
							</Button>
						{/if}
					</div>

					<!-- Hosted By -->
					<div class="order-3 md:order-0 md:col-start-1">
						<p
							class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
						>
							Hosted By
						</p>
						<div class="flex items-center gap-2.5">
							<FoxAvatar src={user.profile?.avatar} alt={hostName} class="size-8 shrink-0" />
							<span class="text-base-900 dark:text-base-100 truncate text-sm font-medium">
								{hostName}
							</span>
						</div>
					</div>

					<div class="order-4 space-y-6 md:order-0 md:col-start-1">
						<LinksSection bind:links />
						<ThemeSection bind:theme={eventTheme} />
					</div>
				</div>

				{#if !isNew}
					<div class="border-base-200 dark:border-base-800 mt-12 border-t pt-8">
						{#if showDeleteConfirm}
							<div class="flex items-center gap-3">
								<p class="text-sm text-red-600 dark:text-red-400">
									Are you sure? This cannot be undone.
								</p>
								<Button
									variant="secondary"
									size="sm"
									onclick={() => (showDeleteConfirm = false)}
									disabled={deleting}
								>
									Cancel
								</Button>
								<Button size="sm" onclick={handleDelete} disabled={deleting} variant="red">
									{deleting ? 'Deleting...' : 'Delete'}
								</Button>
							</div>
						{:else}
							<Button variant="red" onclick={() => (showDeleteConfirm = true)}>Delete event</Button>
						{/if}
					</div>
				{/if}
			</form>
		{/if}
	</div>
</div>

<RecurringModal
	bind:open={showRecurringModal}
	{rkey}
	{eventData}
	{isNew}
	{name}
	{startsAt}
	{endsAt}
	{mode}
	{timezone}
	{description}
	{links}
	{location}
	{thumbnailDateStr}
	{thumbnailFile}
	{thumbnailChanged}
	{selectedPreset}
	accent={eventTheme.accentColor}
/>
