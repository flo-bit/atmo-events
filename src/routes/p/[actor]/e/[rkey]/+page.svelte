<script lang="ts">
	import { isEventOngoing, type FlatEventRecord } from '$lib/contrail';
	import { getCDNImageBlobUrl } from '$lib/atproto';
	import { user } from '$lib/atproto/auth.svelte';
	import { Avatar as FoxAvatar, Badge, Button } from '@foxui/core';
	import Map from '$lib/components/Map.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import EventDetail from '$lib/components/EventDetail.svelte';
	import EventRsvp from '$lib/components/EventRsvp.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import EventAttendees from './EventAttendees.svelte';
	import { page } from '$app/state';
	import { marked } from 'marked';
	import { sanitize } from '$lib/cal/sanitize';
	import { generateICalEvent } from '$lib/cal/ical';
	import { launchConfetti } from '@foxui/visual';

	let { data } = $props();

	let eventData: FlatEventRecord = $derived(data.eventData);
	let did: string = $derived(data.actorDid);
	let rkey: string = $derived(data.rkey);
	let hostProfile = $derived(data.hostProfile);
	let attendees = $derived(data.attendees);

	let hostUrl = $derived(`/p/${hostProfile?.handle || did}`);
	let eventPath = $derived(`/p/${hostProfile?.handle || did}/e/${data.rkey}`);
	let shareUrl = $derived(
		typeof window !== 'undefined' ? `${window.location.origin}${eventPath}` : eventPath
	);

	let startsAt = $derived(new Date(eventData.startsAt));
	let endsAt = $derived(eventData.endsAt ? new Date(eventData.endsAt) : null);

	function getModeLabel(mode: string): string {
		if (mode.includes('virtual')) return 'Virtual';
		if (mode.includes('hybrid')) return 'Hybrid';
		if (mode.includes('inperson')) return 'In-Person';
		return 'Event';
	}

	function getModeColor(mode: string): 'cyan' | 'purple' | 'amber' | 'secondary' {
		if (mode.includes('virtual')) return 'cyan';
		if (mode.includes('hybrid')) return 'purple';
		if (mode.includes('inperson')) return 'amber';
		return 'secondary';
	}

	function getLocationData(locations: FlatEventRecord['locations']) {
		if (!locations || locations.length === 0) return null;

		const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
			| { name?: string; street?: string; locality?: string; region?: string; country?: string }
			| undefined;
		if (!loc) return null;

		const shortParts = [loc.street, loc.locality].filter(Boolean);
		const fullParts = [loc.street, loc.locality, loc.region, loc.country].filter(Boolean);
		if (fullParts.length === 0) return null;

		const shortAddress = shortParts.join(', ');
		const fullAddress = fullParts.join(', ');
		const displayName = loc.name || undefined;
		const fullString = displayName ? `${displayName}, ${fullAddress}` : fullAddress;
		const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullString)}`;

		return { name: displayName, shortAddress, fullAddress, fullString, mapsUrl };
	}

	let locationData = $derived(getLocationData(eventData.locations));

	let geoLocation: { lat: number; lng: number } | null = $state(null);

	function initGeoLocation() {
		if (!eventData.locations || eventData.locations.length === 0) return;

		// Check for explicit geo coordinates first
		const geo = eventData.locations.find((v) => v.$type === 'community.lexicon.location.geo') as
			| { latitude?: string; longitude?: string }
			| undefined;
		if (geo?.latitude && geo?.longitude) {
			const lat = parseFloat(geo.latitude);
			const lng = parseFloat(geo.longitude);
			if (!isNaN(lat) && !isNaN(lng)) {
				geoLocation = { lat, lng };
				return;
			}
		}

		// Geocode from address if available
		const addressQuery = locationData?.fullAddress;
		if (addressQuery) {
			fetch(`/api/geocoding?q=${encodeURIComponent(addressQuery)}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((data: unknown) => {
					const d = data as Record<string, unknown> | null;
					if (!d) return;
					if (d.lat && d.lon) {
						geoLocation = { lat: parseFloat(d.lat as string), lng: parseFloat(d.lon as string) };
					}
				})
				.catch(() => {});
		}
	}

	let showShareModal = $state(false);
	let shareModalTitle = $state('Event created!');
	let shareModalText: string | undefined = $state(undefined);

	import { onMount } from 'svelte';
	onMount(() => {
		initGeoLocation();

		const url = new URL(window.location.href);
		if (url.searchParams.has('created')) {
			url.searchParams.delete('created');
			history.replaceState({}, '', url.pathname);
			launchConfetti();
			shareModalTitle = 'Event created!';
			shareModalText = `I'm hosting "${eventData.name}"!\n\n${shareUrl}`;
			showShareModal = true;
		}
	});

	let thumbnailImage = $derived.by(() => {
		if (!eventData.media || eventData.media.length === 0) return null;
		const media = eventData.media.find((m) => m.role === 'thumbnail');
		if (!media?.content) return null;
		const url = getCDNImageBlobUrl({ did, blob: media.content });
		if (!url) return null;
		return { url, alt: media.alt || eventData.name };
	});

	let bannerImage = $derived.by(() => {
		if (!eventData.media || eventData.media.length === 0) return null;
		const media = eventData.media.find((m) => m.role === 'header');
		if (!media?.content) return null;
		const url = getCDNImageBlobUrl({ did, blob: media.content });
		if (!url) return null;
		return { url, alt: media.alt || eventData.name };
	});

	// Prefer thumbnail; fall back to header/banner image
	let displayImage = $derived(thumbnailImage ?? bannerImage);
	let isBannerOnly = $derived(!thumbnailImage && !!bannerImage);

	let isOngoing = $derived(isEventOngoing(eventData.startsAt, eventData.endsAt));

	const renderer = new marked.Renderer();
	renderer.link = ({ href, text }) =>
		`<a target="_blank" rel="noopener noreferrer nofollow" href="${href}" class="text-accent-600 dark:text-accent-400 hover:underline">${text}</a>`;

	function renderDescription(
		text: string,
		facets?: {
			index: { byteStart: number; byteEnd: number };
			features: { $type: string; did?: string; uri?: string; tag?: string }[];
		}[]
	): string {
		let result = text;

		if (facets && facets.length > 0) {
			const encoder = new TextEncoder();
			const encoded = encoder.encode(text);
			const decoder = new TextDecoder();

			// Sort facets in reverse order by byteStart so replacements don't shift positions
			const sorted = [...facets].sort((a, b) => b.index.byteStart - a.index.byteStart);

			for (const facet of sorted) {
				const feature = facet.features?.[0];
				if (!feature) continue;

				const segmentBytes = encoded.slice(facet.index.byteStart, facet.index.byteEnd);
				const segmentText = decoder.decode(segmentBytes);

				let mdLink: string | null = null;
				switch (feature.$type) {
					case 'app.bsky.richtext.facet#mention':
						mdLink = `[${segmentText}](/${feature.did})`;
						break;
					case 'app.bsky.richtext.facet#link':
						mdLink = `[${segmentText}](${feature.uri})`;
						break;
					case 'app.bsky.richtext.facet#tag':
						mdLink = `[${segmentText}](https://bsky.app/hashtag/${feature.tag})`;
						break;
				}

				if (mdLink) {
					// Convert byte offsets to character offsets for string replacement
					const before = decoder.decode(encoded.slice(0, facet.index.byteStart));
					const after = decoder.decode(encoded.slice(facet.index.byteEnd));
					result = before + mdLink + after;
				}
			}
		}

		return marked.parse(result, { renderer }) as string;
	}

	let descriptionHtml = $derived(
		eventData.description
			? sanitize(
					renderDescription(
						eventData.description,
						eventData.facets as
							| {
									index: { byteStart: number; byteEnd: number };
									features: { $type: string; did?: string; uri?: string; tag?: string }[];
							  }[]
							| undefined
					),
					{ ADD_ATTR: ['target'] }
				)
			: null
	);

	let eventUri = $derived(`at://${did}/community.lexicon.calendar.event/${rkey}`);

	let ogImageUrl = $derived(`${page.url.origin}${page.url.pathname}/og.png`);

	let isOwner = $derived(user.isLoggedIn && user.did === did);

	let speakers = $derived(data.speakerProfiles ?? []);

	let attendeesRef: EventAttendees | undefined = $state();

	function handleRsvp(status: 'going' | 'interested') {
		if (!user.did) return;
		attendeesRef?.addAttendee({
			did: user.did,
			status,
			avatar: user.profile?.avatar,
			name: user.profile?.displayName || user.profile?.handle || user.did,
			handle: user.profile?.handle,
			url: `/${user.profile?.handle || user.did}`
		});
		if (status === 'interested') return;
		shareModalTitle = "You're going!";
		shareModalText = `I'm going to "${eventData.name}"!\n\n${shareUrl}`;
		showShareModal = true;
	}

	function handleRsvpCancel() {
		if (!user.did) return;
		attendeesRef?.removeAttendee(user.did);
	}

	function downloadIcs() {
		const ical = generateICalEvent(eventData, eventUri, page.url.href);
		const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${eventData.name.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}

	let normalizedLocation = $derived(
		locationData
			? {
					text: locationData.name || locationData.shortAddress,
					secondaryText: locationData.name ? locationData.shortAddress : undefined,
					mapsUrl: locationData.mapsUrl
				}
			: null
	);
</script>

<svelte:head>
	<title>{eventData.name}</title>
	<meta name="description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta property="og:title" content={eventData.name} />
	<meta property="og:description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta property="og:image" content={ogImageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={eventData.name} />
	<meta name="twitter:description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<EventDetail
	name={eventData.name}
	image={!isBannerOnly ? displayImage?.url ?? null : null}
	imageAlt={displayImage?.alt}
	avatarSeed={data.rkey}
	showImage={!isBannerOnly}
	{startsAt}
	{endsAt}
	{descriptionHtml}
	location={normalizedLocation}
>
	<!-- Banner image (full width, only when no thumbnail) -->
	{#snippet banner()}
		{#if isBannerOnly && displayImage}
			<img
				src={displayImage.url}
				alt={displayImage.alt}
				class="border-base-200 dark:border-base-800 mb-8 aspect-3/1 w-full rounded-2xl border object-cover"
			/>
		{/if}
	{/snippet}

	{#snippet imageExtra()}
		{#if isOwner}
			<Button href="./{rkey}/edit" class="mt-9 w-full">Edit Event</Button>
		{/if}
	{/snippet}

	{#snippet badges()}
		{#if isOngoing}
			<Badge size="md" variant="primary">
				<span class="bg-accent-500 mr-1 inline-block size-1.5 animate-pulse rounded-full"></span>
				Live
			</Badge>
		{/if}
		{#if eventData.mode}
			<Badge size="md" variant={getModeColor(eventData.mode)}
				>{getModeLabel(eventData.mode)}</Badge
			>
		{/if}
	{/snippet}

	<!-- Part of -->
	{#snippet aboveDescription()}
		{#if data.parentEvent}
			<div
				class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 justify-center rounded-2xl border p-4"
			>
				<p
					class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
				>
					Part of
				</p>
				<EventCard event={data.parentEvent} actor="atprotocol.dev" />
				<Button href="/p/atmosphereconf.org" size="lg" class="mt-6 w-full">
					See full schedule
				</Button>
			</div>
		{/if}

		{#if did === 'did:plc:lehcqqkwzcwvjvw66uthu5oq' && rkey === '3lte3c7x43l2e'}
			<Button href="/p/atmosphereconf.org" size="lg" class="mb-4 w-full">
				See full schedule
			</Button>
		{/if}
	{/snippet}

	{#snippet rsvp()}
		<EventRsvp
			{eventUri}
			eventCid={eventData.cid ?? null}
			initialRsvpStatus={data.viewerRsvpStatus}
			initialRsvpRkey={data.viewerRsvpRkey}
			onrsvp={handleRsvp}
			oncancel={handleRsvpCancel}
		/>
	{/snippet}

	<!-- Map -->
	{#snippet belowDescription()}
		{#if geoLocation && locationData}
			<div class="mt-8 mb-8">
				<p
					class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
				>
					Location
				</p>
				<a
					href={locationData.mapsUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="block transition-opacity hover:opacity-80"
				>
					<div class="h-64 w-full overflow-hidden rounded-xl">
						<Map lat={geoLocation.lat} lng={geoLocation.lng} />
					</div>
					<p class="text-base-500 dark:text-base-400 mt-2 text-sm">
						{locationData.fullString}
					</p>
				</a>
			</div>
		{/if}
	{/snippet}

	{#snippet sidebar()}
		<!-- Hosted By -->
		<div>
			<p
				class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
			>
				Hosted By
			</p>
			<a
				href={hostUrl}
				class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
			>
				<FoxAvatar
					src={hostProfile?.avatar}
					alt={hostProfile?.displayName || hostProfile?.handle || did}
					class="size-8 shrink-0"
				/>
				<span class="truncate text-sm">
					{hostProfile?.displayName || hostProfile?.handle || did}
				</span>
			</a>
		</div>

		<!-- Speakers -->
		{#if speakers.length > 0}
			<div>
				<p
					class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
				>
					Speakers
				</p>
				<div class="space-y-2">
					{#each speakers as speaker, i (speaker.id || i)}
						{#if speaker.handle}
							<a
								href="/p/{speaker.handle}"
								class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
							>
								<FoxAvatar src={speaker.avatar} alt={speaker.name} class="size-8 shrink-0" />
								<span class="truncate text-sm">{speaker.name}</span>
							</a>
						{:else}
							<div
								class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium"
							>
								<FoxAvatar alt={speaker.name} class="size-8 shrink-0" />
								<span class="truncate text-sm">{speaker.name}</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/if}

		{#if eventData.uris && eventData.uris.length > 0}
			<!-- Links -->
			<div>
				<p
					class="text-base-500 dark:text-base-400 mb-4 text-xs font-semibold tracking-wider uppercase"
				>
					Links
				</p>
				<div class="space-y-3">
					{#each eventData.uris as link (link.name + link.uri)}
						<a
							href={link.uri}
							target="_blank"
							rel="noopener noreferrer"
							class="text-base-700 dark:text-base-300 hover:text-base-900 dark:hover:text-base-100 flex items-center gap-1.5 text-sm transition-colors"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-3.5 shrink-0"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
								/>
							</svg>
							<span class="truncate">{link.name || link.uri.replace(/^https?:\/\//, '')}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Add to Calendar -->
		<button
			onclick={downloadIcs}
			class="text-base-700 dark:text-base-300 hover:text-base-900 dark:hover:text-base-100 flex cursor-pointer items-center gap-2 text-sm font-medium transition-colors"
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
					d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
				/>
			</svg>
			Add to Calendar
		</button>

		<!-- Attendees -->
		<EventAttendees
			bind:this={attendeesRef}
			going={attendees.going}
			interested={attendees.interested}
			goingCount={attendees.goingCount}
			interestedCount={attendees.interestedCount}
		/>
	{/snippet}
</EventDetail>

<ShareModal
	bind:open={showShareModal}
	url={shareUrl}
	title={shareModalTitle}
	shareText={shareModalText}
	eventName={eventData.name}
	{ogImageUrl}
/>
