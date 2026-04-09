<script lang="ts">
	import { user } from '$lib/atproto/auth.svelte';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { uploadBlob, putRecord, deleteRecord, resolveHandle } from '$lib/atproto/methods';
	import { getCDNImageBlobUrl } from '$lib/atproto';
	import { notifyContrailOfUpdate } from '$lib/contrail';
	import { compressImage } from '$lib/atproto/image-helper';
	import { validateLink } from '$lib/cal/helper';
	import * as TID from '@atcute/tid';
	import {
		Avatar as FoxAvatar,
		Button,
		PopoverRoot,
		PopoverTrigger,
		PopoverContent,
		ToggleGroup,
		ToggleGroupItem,
		Input,
		Checkbox
	} from '@foxui/core';
	import { goto } from '$app/navigation';
	import { tokenize, type Token } from '@atcute/bluesky-richtext-parser';
	import type { Handle } from '@atcute/lexicons';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { putImage, getImage, deleteImage } from '$lib/components/image-store';
	import { Modal } from '@foxui/core';
	import { PlainTextEditor } from '@foxui/text';
	import Avatar from 'svelte-boring-avatars';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import TimezonePicker from '$lib/components/TimezonePicker.svelte';
	import { parseDateTime } from '@internationalized/date';
	import { datetimeLocalToISO, isoToDatetimeLocalInTz } from '$lib/date-format';
	import ThumbnailPresets from '$lib/components/ThumbnailPresets.svelte';
	import { designs } from '$lib/components/thumbnails/designs';
	import type { FlatEventRecord } from '$lib/contrail';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import ThemeApply from '$lib/components/ThemeApply.svelte';
	import ThemeBackground from '$lib/components/ThemeBackground.svelte';
	import { defaultTheme, themeBackgrounds, type EventTheme } from '$lib/theme';

	let {
		eventData = null,
		actorDid,
		rkey
	}: {
		eventData: FlatEventRecord | null;
		actorDid: string;
		rkey: string;
	} = $props();

	let isNew = $derived(eventData === null);
	let DRAFT_KEY = $derived(`blento-event-edit-${rkey}`);

	type EventMode = 'inperson' | 'virtual' | 'hybrid';

	interface EventLocation {
		street?: string;
		locality?: string;
		region?: string;
		country?: string;
	}

	interface EventDraft {
		name: string;
		description: string;
		startsAt: string;
		endsAt: string;
		timezone?: string;
		theme?: EventTheme;
		links: Array<{ uri: string; name: string }>;
		mode?: EventMode;
		thumbnailKey?: string;
		thumbnailChanged?: boolean;
		location?: EventLocation | null;
		locationChanged?: boolean;
	}

	let thumbnailKey: string | null = $state(null);
	let thumbnailChanged = $state(false);

	// svelte-ignore state_referenced_locally
	let name = $state(eventData?.name || '');
	let description = $state('');
	let startsAt = $state('');
	let endsAt = $state('');
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let mode: EventMode = $state('inperson');
	let eventTheme: EventTheme = $state({ ...defaultTheme });
	let showThemeModal = $state(false);
	let thumbnailFile: File | null = $state(null);
	let thumbnailPreview: string | null = $state(null);
	let selectedPreset: { design: string; seed: number } | null = $state(null);
	let presetPreviewCanvas: HTMLCanvasElement | undefined = $state(undefined);
	let showThumbnailModal = $state(false);
	let submitting = $state(false);
	let error: string | null = $state(null);
	import type { Readable } from 'svelte/store';
	import { get } from 'svelte/store';
	import type { Editor } from '@tiptap/core';
	let titleEditor: Readable<Editor> | undefined = $state(undefined);

	let location: EventLocation | null = $state(null);
	let locationChanged = $state(false);
	let showLocationModal = $state(false);
	let locationSearch = $state('');
	let locationSearching = $state(false);
	let locationError = $state('');
	let locationResult: { displayName: string; location: EventLocation } | null = $state(null);

	let links: Array<{ uri: string; name: string }> = $state([]);
	let showLinkPopup = $state(false);
	let newLinkUri = $state('');
	let newLinkName = $state('');
	let linkError = $state('');

	let draftLoaded = $state(false);

	let showRecurringModal = $state(false);
	let recurringInterval = $state(1);
	let recurringUnit: 'days' | 'weeks' | 'months' | 'years' = $state('weeks');
	let recurringCount = $state(4);
	let recurringNumberInTitle = $state(false);
	let recurringCreating = $state(false);
	let recurringError: string | null = $state(null);
	let recurringCreated = $state(0);

	let titleNumberMatch = $derived(name.match(/#?(\d+)\s*$/));
	let detectedStartNumber = $derived(titleNumberMatch ? parseInt(titleNumberMatch[1]) : null);

	$effect(() => {
		if (detectedStartNumber !== null) {
			recurringNumberInTitle = true;
		}
	});

	function stripModePrefix(modeStr: string): EventMode {
		const stripped = modeStr.replace('community.lexicon.calendar.event#', '');
		if (stripped === 'virtual' || stripped === 'hybrid' || stripped === 'inperson') return stripped;
		return 'inperson';
	}

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
		links = eventData.uris ? eventData.uris.map((l) => ({ uri: l.uri, name: l.name || '' })) : [];
		if (eventData.theme) eventTheme = { ...eventData.theme };
		populateLocationFromEventData();
		populateThumbnailFromEventData();
	}

	onMount(async () => {
		// Migrate old creation draft if this is a new event
		if (isNew) {
			const oldDraft = localStorage.getItem('blento-event-draft');
			if (oldDraft && !localStorage.getItem(DRAFT_KEY)) {
				localStorage.setItem(DRAFT_KEY, oldDraft);
				localStorage.removeItem('blento-event-draft');
			}
		}

		const saved = localStorage.getItem(DRAFT_KEY);
		if (saved) {
			try {
				const draft: EventDraft = JSON.parse(saved);
				name = draft.name || '';
				description = draft.description || '';
				startsAt = draft.startsAt || '';
				endsAt = draft.endsAt || '';
				if (draft.timezone) timezone = draft.timezone;
				if (draft.theme) eventTheme = draft.theme;
				links = draft.links || [];
				mode = draft.mode || 'inperson';
				locationChanged = draft.locationChanged || false;
				if (draft.locationChanged) {
					location = draft.location || null;
				} else if (!isNew) {
					// For edits without location changes, load from event data
					populateLocationFromEventData();
				}
				thumbnailChanged = draft.thumbnailChanged || false;

				if (draft.thumbnailKey) {
					const img = await getImage(draft.thumbnailKey);
					if (img) {
						thumbnailKey = draft.thumbnailKey;
						thumbnailFile = new File([img.blob], img.name, { type: img.blob.type });
						thumbnailPreview = URL.createObjectURL(img.blob);
						thumbnailChanged = true;
					}
				} else if (!thumbnailChanged && !isNew) {
					// No new thumbnail in draft, show existing one from event data
					populateThumbnailFromEventData();
				}
			} catch {
				localStorage.removeItem(DRAFT_KEY);
				if (!isNew) populateFromEventData();
			}
		} else if (!isNew) {
			populateFromEventData();
		}
		draftLoaded = true;
		if (titleEditor) get(titleEditor)?.commands.focus();
	});

	let saveDraftTimeout: ReturnType<typeof setTimeout> | undefined;

	function saveDraft() {
		if (!draftLoaded || !browser) return;
		clearTimeout(saveDraftTimeout);
		saveDraftTimeout = setTimeout(() => {
			const draft: EventDraft = {
				name,
				description,
				startsAt,
				endsAt,
				timezone,
				theme: eventTheme,
				links,
				mode,
				thumbnailChanged,
				locationChanged
			};
			if (locationChanged) draft.location = location;
			if (thumbnailKey) draft.thumbnailKey = thumbnailKey;
			localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
		}, 500);
	}

	$effect(() => {
		// track all draft fields by reading them
		void [
			name,
			description,
			startsAt,
			endsAt,
			timezone,
			JSON.stringify(eventTheme),
			mode,
			JSON.stringify(links),
			JSON.stringify(location)
		];
		saveDraft();
	});

	async function searchLocation() {
		const q = locationSearch.trim();
		if (!q) return;
		locationError = '';
		locationSearching = true;
		locationResult = null;

		try {
			const response = await fetch('/api/geocoding?q=' + encodeURIComponent(q));
			if (!response.ok) throw new Error('response not ok');
			const data: Record<string, unknown> = await response.json();
			if (!data || data.error) throw new Error('no results');

			const addr = (data.address || {}) as Record<string, string>;
			const road = addr.road || '';
			const houseNumber = addr.house_number || '';
			const street = road ? (houseNumber ? `${road} ${houseNumber}` : road) : '';
			const locality =
				addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || '';
			const region = addr.state || addr.county || '';
			const country = addr.country || '';

			locationResult = {
				displayName: (data.display_name as string) || q,
				location: {
					...(street && { street }),
					...(locality && { locality }),
					...(region && { region }),
					...(country && { country })
				}
			};
		} catch {
			locationError = "Couldn't find that location.";
		} finally {
			locationSearching = false;
		}
	}

	function confirmLocation() {
		if (locationResult) {
			location = locationResult.location;
			locationChanged = true;
		}
		showLocationModal = false;
		locationSearch = '';
		locationResult = null;
		locationError = '';
	}

	function removeLocation() {
		location = null;
		locationChanged = true;
	}

	function getLocationDisplayString(loc: EventLocation): string {
		return [loc.street, loc.locality, loc.region, loc.country].filter(Boolean).join(', ');
	}

	function addLink() {
		const raw = newLinkUri.trim();
		if (!raw) return;
		const uri = validateLink(raw);
		if (!uri) {
			linkError = 'Please enter a valid URL';
			return;
		}
		links.push({ uri, name: newLinkName.trim() });
		newLinkUri = '';
		newLinkName = '';
		linkError = '';
		showLinkPopup = false;
	}

	function removeLink(index: number) {
		links.splice(index, 1);
	}

	let fileInput: HTMLInputElement | undefined = $state();

	let hostName = $derived(user.profile?.displayName || user.profile?.handle || user.did || '');

	async function setThumbnail(file: File) {
		thumbnailFile = file;
		thumbnailChanged = true;
		selectedPreset = null;
		if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
		thumbnailPreview = URL.createObjectURL(file);

		if (thumbnailKey) await deleteImage(thumbnailKey);
		thumbnailKey = crypto.randomUUID();
		await putImage(thumbnailKey, file, file.name);
		saveDraft();
	}

	async function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		setThumbnail(file);
	}

	let isDragOver = $state(false);

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file?.type.startsWith('image/')) {
			setThumbnail(file);
		}
	}

	function removeThumbnail() {
		thumbnailFile = null;
		thumbnailChanged = true;
		selectedPreset = null;
		if (thumbnailPreview) {
			URL.revokeObjectURL(thumbnailPreview);
			thumbnailPreview = null;
		}
		if (thumbnailKey) {
			deleteImage(thumbnailKey);
			thumbnailKey = null;
		}
		if (fileInput) fileInput.value = '';
		saveDraft();
	}

	let thumbnailDateStr = $derived.by(() => {
		if (!startsAt) return '';
		const d = new Date(startsAt);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	});

	// Render preset preview canvas
	$effect(() => {
		if (selectedPreset && presetPreviewCanvas && designs[selectedPreset.design]) {
			const ctx = presetPreviewCanvas.getContext('2d');
			if (!ctx) return;
			presetPreviewCanvas.width = 800;
			presetPreviewCanvas.height = 800;
			designs[selectedPreset.design](ctx, 800, 800, name || 'Event', thumbnailDateStr, selectedPreset.seed);
		}
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

	async function tokensToFacets(tokens: Token[]): Promise<Record<string, unknown>[]> {
		const encoder = new TextEncoder();
		const facets: Record<string, unknown>[] = [];
		let byteOffset = 0;

		for (const token of tokens) {
			const tokenBytes = encoder.encode(token.raw);
			const byteStart = byteOffset;
			const byteEnd = byteOffset + tokenBytes.length;

			if (token.type === 'mention') {
				try {
					const did = await resolveHandle({ handle: token.handle as Handle });
					if (did) {
						facets.push({
							index: { byteStart, byteEnd },
							features: [{ $type: 'app.bsky.richtext.facet#mention', did }]
						});
					}
				} catch {
					// skip unresolvable mentions
				}
			} else if (token.type === 'autolink') {
				facets.push({
					index: { byteStart, byteEnd },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: token.url }]
				});
			} else if (token.type === 'topic') {
				facets.push({
					index: { byteStart, byteEnd },
					features: [{ $type: 'app.bsky.richtext.facet#tag', tag: token.name }]
				});
			}

			byteOffset = byteEnd;
		}

		return facets;
	}

	async function handleSubmit() {
		error = null;

		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		if (!startsAt) {
			error = 'Start date is required.';
			return;
		}
		if (!endsAt) {
			error = 'End date is required.';
			return;
		}
		if (!user.isLoggedIn || !user.did) {
			error = 'You must be logged in.';
			return;
		}

		submitting = true;

		try {
			// Generate thumbnail from preset if selected and no custom upload
			if (selectedPreset && !thumbnailFile && designs[selectedPreset.design]) {
				const canvas = document.createElement('canvas');
				canvas.width = 800;
				canvas.height = 800;
				const ctx = canvas.getContext('2d')!;
				designs[selectedPreset.design](ctx, 800, 800, name.trim() || 'Event', thumbnailDateStr, selectedPreset.seed);
				const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
				if (blob) {
					thumbnailFile = new File([blob], 'thumbnail.png', { type: 'image/png' });
					thumbnailChanged = true;
				}
			}

			let media: Array<Record<string, unknown>> | undefined;

			// Start with existing media, excluding thumbnail role
			const existingMedia = (eventData?.media ?? []) as Array<Record<string, unknown>>;

			if (isNew || thumbnailChanged) {
				if (thumbnailFile) {
					const compressed = await compressImage(thumbnailFile);
					const result = await uploadBlob({ blob: compressed.blob });
					if (result) {
						const { aspectRatio: _ar, ...blobRef } = result as Record<string, unknown> & { aspectRatio?: unknown };
						// Keep all non-thumbnail media, add new thumbnail
						media = [
							...existingMedia.filter((m) => m.role !== 'thumbnail'),
							{
								role: 'thumbnail',
								content: blobRef,
								aspect_ratio: {
									width: compressed.aspectRatio.width,
									height: compressed.aspectRatio.height
								}
							}
						];
					}
				} else {
					// Thumbnail removed — keep all non-thumbnail media
					const remaining = existingMedia.filter((m) => m.role !== 'thumbnail');
					if (remaining.length > 0) media = remaining;
				}
			} else {
				// Thumbnail not changed — keep all original media
				if (existingMedia.length > 0) {
					media = existingMedia;
				}
			}

			const createdAt = isNew
				? new Date().toISOString()
				: eventData?.createdAt || new Date().toISOString();

			// Spread original record to preserve unspecced fields (e.g. additionalData)
			const record: Record<string, unknown> = {
				...(eventData ? { ...eventData } : {}),
				$type: 'community.lexicon.calendar.event',
				createdWith: 'https://atmo.rsvp',
				name: name.trim(),
				mode: `community.lexicon.calendar.event#${mode}`,
				status: 'community.lexicon.calendar.event#scheduled',
				startsAt: datetimeLocalToISO(startsAt, timezone),
				timezone,
				createdAt,
				theme: eventTheme
			};
			// Remove flattened fields that aren't part of the actual record
			delete record.cid;
			delete record.did;
			delete record.rkey;
			delete record.uri;
			delete record.rsvps;
			delete record.rsvpsCount;
			delete record.rsvpsGoingCount;
			delete record.rsvpsInterestedCount;
			delete record.rsvpsNotgoingCount;

			const trimmedDescription = description.trim();
			if (trimmedDescription) {
				record.description = trimmedDescription;
				const tokens = tokenize(trimmedDescription);
				const facets = await tokensToFacets(tokens);
				if (facets.length > 0) {
					record.facets = facets;
				}
			}
			if (endsAt) {
				record.endsAt = datetimeLocalToISO(endsAt, timezone);
			}
			if (media) {
				record.media = media;
			}
			if (links.length > 0) {
				record.uris = links;
			}
			if (isNew || locationChanged) {
				if (location) {
					record.locations = [
						{
							$type: 'community.lexicon.location.address',
							...location
						}
					];
				}
				// If changed/new but no location, locations stays undefined (removed/absent)
			} else if (eventData?.locations && eventData.locations.length > 0) {
				record.locations = eventData.locations;
			}

			const response = await putRecord({
				collection: 'community.lexicon.calendar.event',
				rkey,
				record
			});

			if (response.ok) {
				const eventUri = `at://${user.did}/community.lexicon.calendar.event/${rkey}`;
				await notifyContrailOfUpdate(eventUri);
				localStorage.removeItem(DRAFT_KEY);
				if (thumbnailKey) deleteImage(thumbnailKey);
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
			localStorage.removeItem(DRAFT_KEY);
			if (thumbnailKey) deleteImage(thumbnailKey);
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

	async function handleCreateRecurring() {
		if (!name.trim() || !startsAt || !user.isLoggedIn || !user.did) return;

		recurringCreating = true;
		recurringError = null;
		recurringCreated = 0;

		try {
			// Recurring instances advance by wall-clock duration (e.g. "every week
			// at 10am"), so operate on CalendarDateTime — not absolute instants —
			// to preserve the wall time across DST transitions.
			const baseStart = parseDateTime(startsAt);
			const baseEnd = endsAt ? parseDateTime(endsAt) : null;
			const durationMs = baseEnd
				? baseEnd.toDate(timezone).getTime() - baseStart.toDate(timezone).getTime()
				: 0;
			const baseName = recurringNumberInTitle && titleNumberMatch
				? name.replace(/#?\d+\s*$/, '').trimEnd()
				: name.trim();
			const startNum = detectedStartNumber ?? 1;
			const hasHash = titleNumberMatch ? titleNumberMatch[0].includes('#') : false;

			// Generate thumbnail from preset if selected and no custom upload
			if (selectedPreset && !thumbnailFile && designs[selectedPreset.design]) {
				const canvas = document.createElement('canvas');
				canvas.width = 800;
				canvas.height = 800;
				const ctx = canvas.getContext('2d')!;
				designs[selectedPreset.design](ctx, 800, 800, name.trim() || 'Event', thumbnailDateStr, selectedPreset.seed);
				const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
				if (blob) {
					thumbnailFile = new File([blob], 'thumbnail.png', { type: 'image/png' });
					thumbnailChanged = true;
				}
			}

			// Build the same record shape as handleSubmit
			let media: Array<Record<string, unknown>> | undefined;
			const existingMedia = (eventData?.media ?? []) as Array<Record<string, unknown>>;

			if (isNew || thumbnailChanged) {
				if (thumbnailFile) {
					const compressed = await compressImage(thumbnailFile);
					const result = await uploadBlob({ blob: compressed.blob });
					if (result) {
						const { aspectRatio: _ar, ...blobRef } = result as Record<string, unknown> & { aspectRatio?: unknown };
						media = [
							...existingMedia.filter((m) => m.role !== 'thumbnail'),
							{
								role: 'thumbnail',
								content: blobRef,
								aspect_ratio: { width: compressed.aspectRatio.width, height: compressed.aspectRatio.height }
							}
						];
					}
				} else {
					const remaining = existingMedia.filter((m) => m.role !== 'thumbnail');
					if (remaining.length > 0) media = remaining;
				}
			} else if (existingMedia.length > 0) {
				media = existingMedia;
			}

			const parentUri = `at://${user.did}/community.lexicon.calendar.event/${rkey}`;

			for (let i = 0; i < recurringCount; i++) {
				const offset = i + 1;
				const step = offset * recurringInterval;
				const eventStart =
					recurringUnit === 'days'
						? baseStart.add({ days: step })
						: recurringUnit === 'weeks'
							? baseStart.add({ weeks: step })
							: recurringUnit === 'months'
								? baseStart.add({ months: step })
								: baseStart.add({ years: step });

				const eventStartIso = eventStart.toDate(timezone).toISOString();
				// Preserve the original absolute duration (handles events that
				// span midnight or odd wall-clock lengths correctly).
				const eventEndIso = durationMs
					? new Date(eventStart.toDate(timezone).getTime() + durationMs).toISOString()
					: null;

				let eventName = baseName;
				if (recurringNumberInTitle) {
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
				if (trimmedDescription) {
					record.description = trimmedDescription;
				}
				if (eventEndIso) {
					record.endsAt = eventEndIso;
				}
				if (media) {
					record.media = media;
				}
				if (links.length > 0) {
					record.uris = links;
				}
				if (location) {
					record.locations = [{
						$type: 'community.lexicon.location.address',
						...location
					}];
				}

				const response = await putRecord({
					collection: 'community.lexicon.calendar.event',
					rkey: newRkey,
					record
				});

				if (response.ok) {
					const eventUri = `at://${user.did}/community.lexicon.calendar.event/${newRkey}`;
					await notifyContrailOfUpdate(eventUri);
					recurringCreated = i + 1;
				} else {
					recurringError = `Failed to create event ${i + 1}. Stopping.`;
					return;
				}
			}

			showRecurringModal = false;
		} catch (e) {
			console.error('Failed to create recurring events:', e);
			recurringError = 'Failed to create recurring events. Please try again.';
		} finally {
			recurringCreating = false;
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
					<!-- Thumbnail (left column) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="order-1 max-w-sm md:order-0 md:col-start-1 md:max-w-none"
						ondragover={onDragOver}
						ondragleave={onDragLeave}
						ondrop={onDrop}
					>
						<input
							bind:this={fileInput}
							type="file"
							accept="image/*"
							onchange={(e) => { onFileChange(e); showThumbnailModal = false; }}
							class="hidden"
						/>
						<div class="group relative">
							{#if thumbnailPreview}
								<img
									src={thumbnailPreview}
									alt="Thumbnail preview"
									class="border-base-200 dark:border-base-800 aspect-square w-full rounded-2xl border object-cover"
								/>
							{:else if selectedPreset && designs[selectedPreset.design]}
								<div class="border-base-200 dark:border-base-800 aspect-square w-full overflow-hidden rounded-2xl border">
									<canvas bind:this={presetPreviewCanvas} class="h-full w-full"></canvas>
								</div>
							{:else}
								<div
									class="bg-base-100 dark:bg-base-900 aspect-square w-full overflow-hidden rounded-2xl [&>svg]:h-full [&>svg]:w-full"
								>
									<Avatar
										size={400}
										name={rkey}
										variant="marble"
										colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
										square
									/>
								</div>
							{/if}
							<button
								type="button"
								onclick={() => (showThumbnailModal = true)}
								class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/0 text-white/0 transition-colors group-hover:bg-black/40 group-hover:text-white/90 {isDragOver
									? 'bg-black/40 text-white/90'
									: ''}"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="size-6"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
									/>
								</svg>
								<span class="text-sm font-medium">Change thumbnail</span>
							</button>
							{#if thumbnailPreview || selectedPreset}
								<Button
									variant="ghost"
									size="iconSm"
									onclick={removeThumbnail}
									class="bg-base-900/70 absolute top-2 right-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
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
							{/if}
						</div>
					</div>
						<Button
							variant="secondary"
							class="mt-3 w-full"
							onclick={() => (showThemeModal = true)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
							</svg>
							Theme: {themeBackgrounds[eventTheme.name] || eventTheme.name}
						</Button>
					<Button
						type="submit"
						class="mt-3 w-full"
						disabled={submitting || !name.trim() || !startsAt || !endsAt}
					>
						{submitting
							? isNew
								? 'Publishing...'
								: 'Saving...'
							: isNew
								? 'Publish Event'
								: 'Save Event'}
					</Button>
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
						<div class="mb-8">
							<ToggleGroup
								type="single"
								bind:value={
									() => {
										return mode;
									},
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

						<!-- Location row -->
						{#if location}
							<div class="mb-6 flex items-center gap-4">
								<div
									class="border-base-200 dark:border-base-700 bg-base-100 dark:bg-base-950/30 flex size-12 shrink-0 items-center justify-center rounded-xl border"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="text-base-900 dark:text-base-200 size-5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
										/>
									</svg>
								</div>
								<p class="text-base-900 dark:text-base-50 flex-1 font-semibold">
									{getLocationDisplayString(location)}
								</p>
								<Button variant="ghost" size="iconSm" onclick={removeLocation} class="shrink-0">
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
						{:else}
							<div class="mb-6">
								<Button variant="secondary" onclick={() => (showLocationModal = true)}>
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
											d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
										/>
									</svg>
									Add location
								</Button>
							</div>
						{/if}

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
								onclick={() => {
									recurringError = null;
									recurringCreated = 0;
									showRecurringModal = true;
								}}
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

					<!-- Links -->
					<div class="order-4 md:order-0 md:col-start-1">
						<p
							class="text-base-500 dark:text-base-400 mb-4 text-xs font-semibold tracking-wider uppercase"
						>
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
							<PopoverRoot bind:open={showLinkPopup}>
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
										bind:value={newLinkUri}
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
										bind:value={newLinkName}
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
									{#if linkError}
										<p class="mb-2 text-xs text-red-500">{linkError}</p>
									{/if}
									<div class="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => {
												showLinkPopup = false;
												linkError = '';
												newLinkUri = '';
												newLinkName = '';
											}}
										>
											Cancel
										</Button>
										<Button onclick={addLink} size="sm" disabled={!newLinkUri.trim()}>Add</Button>
									</div>
								</PopoverContent>
							</PopoverRoot>
						</div>
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

<!-- Theme modal -->
<Modal bind:open={showThemeModal}>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Event theme</p>
	<div class="mt-4">
		<ThemePicker bind:theme={eventTheme} />
	</div>
</Modal>

<!-- Thumbnail modal -->
<Modal bind:open={showThumbnailModal}>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Choose thumbnail</p>
	<div class="mt-4 flex max-h-[70vh] flex-col gap-6 overflow-y-auto">
		<Button
			variant="secondary"
			class="w-full"
			onclick={() => fileInput?.click()}
		>
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
					d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
				/>
			</svg>
			Upload own thumbnail
		</Button>
		<ThumbnailPresets
			name={name}
			dateStr={thumbnailDateStr}
			bind:selected={selectedPreset}
			onselect={() => { showThumbnailModal = false; thumbnailPreview = null; thumbnailFile = null; thumbnailChanged = true; }}
		/>
	</div>
</Modal>

<!-- Location modal -->
<Modal bind:open={showLocationModal}>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Add location</p>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			searchLocation();
		}}
		class="mt-2"
	>
		<div class="flex gap-2">
			<Input type="text" class="flex-1" bind:value={locationSearch} />
			<Button type="submit" disabled={locationSearching || !locationSearch.trim()}>
				{locationSearching ? 'Searching...' : 'Search'}
			</Button>
		</div>
	</form>

	{#if locationError}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400">{locationError}</p>
	{/if}

	{#if locationResult}
		<div
			class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 mt-4 overflow-hidden rounded-xl border p-4"
		>
			<div class="flex items-start gap-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="text-base-500 mt-0.5 size-5 shrink-0"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
					/>
				</svg>
				<div class="min-w-0 flex-1">
					<p class="text-base-900 dark:text-base-50 font-medium">
						{getLocationDisplayString(locationResult.location)}
					</p>
					<p class="text-base-500 dark:text-base-400 mt-0.5 truncate text-xs">
						{locationResult.displayName}
					</p>
				</div>
			</div>
			<div class="mt-4 flex justify-end">
				<Button onclick={confirmLocation}>Use this location</Button>
			</div>
		</div>
	{/if}

	<p class="text-base-400 dark:text-base-500 mt-4 text-xs">
		Geocoding by <a
			href="https://nominatim.openstreetmap.org/"
			class="hover:text-base-600 dark:hover:text-base-400 underline"
			target="_blank">Nominatim</a
		>
		/ &copy;
		<a
			href="https://www.openstreetmap.org/copyright"
			class="hover:text-base-600 dark:hover:text-base-400 underline"
			target="_blank">OpenStreetMap contributors</a
		>
	</p>
</Modal>

<Modal bind:open={showRecurringModal}>
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
			<Input type="number" bind:value={recurringCount} min={1} max={52} class="w-24" />
		</div>

		<div>
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">
				Repeat every
			</label>
			<div class="flex items-center gap-2">
				<Input type="number" bind:value={recurringInterval} min={1} max={99} class="w-20" />
				<ToggleGroup type="single" bind:value={recurringUnit}>
					<ToggleGroupItem value="days">days</ToggleGroupItem>
					<ToggleGroupItem value="weeks">weeks</ToggleGroupItem>
					<ToggleGroupItem value="months">months</ToggleGroupItem>
					<ToggleGroupItem value="years">years</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</div>

		<div>
			<div class="flex items-center gap-2">
				<Checkbox bind:checked={recurringNumberInTitle} sizeVariant="sm" />
				<span class="text-base-700 dark:text-base-300 text-sm font-medium">Number in title</span>
			</div>
			<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
				{#if recurringNumberInTitle && detectedStartNumber !== null}
					Titles will count up from #{detectedStartNumber + 1}
				{:else if recurringNumberInTitle}
					A number will be appended to each title
				{:else}
					Append a number to each event title
				{/if}
			</p>
		</div>
	</div>

	{#if recurringError}
		<p class="mt-4 text-sm text-red-600 dark:text-red-400">{recurringError}</p>
	{/if}

	{#if recurringCreating && recurringCreated > 0}
		<p class="text-base-500 dark:text-base-400 mt-4 text-sm">
			Created {recurringCreated} of {recurringCount} events...
		</p>
	{/if}

	{#if recurringCreated > 0 && !recurringCreating}
		<p class="mt-4 text-sm text-green-600 dark:text-green-400">
			Successfully created {recurringCreated} recurring events!
		</p>
	{/if}

	<div class="mt-4 flex justify-end gap-2">
		<Button
			variant="secondary"
			onclick={() => (showRecurringModal = false)}
			disabled={recurringCreating}
		>
			{recurringCreated > 0 && !recurringCreating ? 'Close' : 'Cancel'}
		</Button>
		{#if !recurringCreated || recurringCreating}
			<Button
				onclick={handleCreateRecurring}
				disabled={recurringCreating || recurringCount < 1}
			>
				{recurringCreating ? `Creating...` : `Create ${recurringCount} event${recurringCount === 1 ? '' : 's'}`}
			</Button>
		{/if}
	</div>
</Modal>
