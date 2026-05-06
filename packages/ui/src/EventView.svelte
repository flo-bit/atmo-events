<script lang="ts">
	import { eventUrl, isEventOngoing, type FlatEventRecord } from './contrail.js';
	import { getCDNImageBlobUrl } from './atproto-helpers.js';
	import { Avatar as FoxAvatar, Button, ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import ShareModal from './ShareModal.svelte';
	import EventComments from './EventComments.svelte';
	import Avatar from 'svelte-boring-avatars';
	import EventRsvp from './EventRsvp.svelte';
	import EventCard from './EventCard.svelte';
	import EventAttendees from './EventAttendees.svelte';
	import VodPlayer, { type VodPlayerApi } from './VodPlayer.svelte';
	import StreamPlacePlayer from './event-view/StreamPlacePlayer.svelte';
	import { launchConfetti } from '@foxui/visual';
	import ThemeBackground from './ThemeBackground.svelte';
	import ThemeApply from './ThemeApply.svelte';
	import { defaultTheme, type EventTheme } from './theme.js';
	import { onMount } from 'svelte';
	import type { EditorAdapter, EditorViewer } from './editor/adapter.js';

	import EventBadges from './event-view/EventBadges.svelte';
	import EventDateBlock from './event-view/EventDateBlock.svelte';
	import EventLocationBlock from './event-view/EventLocationBlock.svelte';
	import EventLocationMap from './event-view/EventLocationMap.svelte';
	import EventHostedBy from './event-view/EventHostedBy.svelte';
	import EventLinksList from './event-view/EventLinksList.svelte';
	import AddToCalendarButton from './event-view/AddToCalendarButton.svelte';
	import InviteShareFlow from './event-view/InviteShareFlow.svelte';
	import { buildDescriptionHtml, getLocationData, resolveGeoLocation, type GeoLocation } from './event-view/format';

	let {
		data,
		adapter,
		viewer,
		pageUrl,
		embedMode = false,
		shareUrlOverride
	}: {
		data: any;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		/** Current page URL — used for the OG image link and the calendar button. */
		pageUrl: URL;
		embedMode?: boolean;
		/** When set, the share modal / Bluesky post embed use this URL instead
		 *  of the canonical atmo.rsvp event URL. Useful for embedders that want
		 *  share links to point at their own event page. */
		shareUrlOverride?: string;
	} = $props();

	let eventData: FlatEventRecord = $derived(data.eventData);
	let did: string = $derived(data.actorDid);
	let rkey: string = $derived(data.rkey);
	let hostProfile = $derived(data.hostProfile);
	let attendees = $derived(data.attendees);

	let theme: EventTheme = $derived(eventData.theme ?? defaultTheme);

	let hostUrl = $derived(`/p/${hostProfile?.handle || did}`);
	let eventPath = $derived(eventUrl(eventData, hostProfile?.handle || did));
	let shareUrl = $derived(
		shareUrlOverride
			? shareUrlOverride
			: typeof window !== 'undefined'
				? `${window.location.origin}${eventPath}`
				: eventPath
	);

	// Times are always rendered in the viewer's local timezone — the stored UTC
	// instant is what the Date constructor parses, and toLocaleString/Time uses
	// the browser's zone by default.
	let startDate = $derived(new Date(eventData.startsAt));
	let endDate = $derived(eventData.endsAt ? new Date(eventData.endsAt) : null);

	let locationData = $derived(getLocationData(eventData.locations));
	let geoLocation: GeoLocation | null = $state(null);

	let showShareModal = $state(false);
	let shareModalTitle = $state('Event created!');
	let shareModalText: string | undefined = $state(undefined);
	// True only when the share modal was opened via the post-creation flow by
	// the event's host. Drives the "show comments on event page" checkbox and
	// the bskyPostRef write — RSVP shares should never overwrite the comments
	// root, even when the RSVPer is the host.
	let canSetEventComments = $state(false);
	let isHost = $derived(!!viewer.did && viewer.did === did);
	let hasComments = $derived(
		!!eventData.bskyPostRef?.showComments && !!eventData.bskyPostRef?.uri
	);
	let aboutCommentsTab = $state<'about' | 'comments'>('about');

	onMount(async () => {
		geoLocation = await resolveGeoLocation(eventData.locations, locationData);

		const url = new URL(window.location.href);
		if (url.searchParams.has('created')) {
			url.searchParams.delete('created');
			history.replaceState({}, '', url.pathname);
			launchConfetti();
			shareModalTitle = 'Event created!';
			shareModalText = `I'm hosting "${eventData.name}"!\n\n${shareUrl}`;
			canSetEventComments = isHost;
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
	let isPast = $derived(endDate ? endDate < new Date() : false);

	let streamPlaceHandle = $derived.by(() => {
		const uris = eventData.uris;
		if (!uris) return null;
		for (const { uri } of uris) {
			const m = uri.match(/^https?:\/\/stream\.place\/([^/?#]+)/i);
			if (m) return m[1];
		}
		return null;
	});

	let descriptionHtml = $derived(
		buildDescriptionHtml(eventData.description, eventData.facets)
	);

	let eventUri = $derived(`at://${did}/community.lexicon.calendar.event/${rkey}`);

	let ogImageUrl = $derived(data.ogImage ?? `${pageUrl.origin}${pageUrl.pathname}/og.png`);

	let isOwner = $derived(!embedMode && viewer.isLoggedIn && viewer.did === did);

	let speakers = $derived(data.speakerProfiles ?? []);

	let vodCurrentTime = $state(0);
	let vodApi: VodPlayerApi | undefined = $state();

	let attendeesRef: EventAttendees | undefined = $state();

	function handleRsvp(status: 'going' | 'interested') {
		if (!viewer.did) return;
		attendeesRef?.addAttendee({
			did: viewer.did,
			status,
			avatar: viewer.avatar,
			name: viewer.displayName || viewer.handle || viewer.did,
			handle: viewer.handle,
			url: `/${viewer.handle || viewer.did}`
		});
		if (status === 'interested') return;
		shareModalTitle = "You're going!";
		shareModalText = `I'm going to "${eventData.name}".\n\n${shareUrl}`;
		canSetEventComments = false;
		showShareModal = true;
	}

	function handleRsvpCancel() {
		if (!viewer.did) return;
		attendeesRef?.removeAttendee(viewer.did);
	}
</script>

<svelte:head>
	<title>{eventData.name}</title>
	<meta name="description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta property="og:title" content={eventData.name} />
	<meta property="og:description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={eventData.name} />
	<meta name="twitter:description" content={eventData.description || `Event: ${eventData.name}`} />
	<meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<ThemeApply accentColor={theme.accentColor} baseColor={theme.baseColor} />
<ThemeBackground {theme} />

<div class="min-h-screen px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-3xl">
		<!-- Banner image (full width, only when no thumbnail) -->
		{#if isBannerOnly && displayImage}
			<img
				src={displayImage.url}
				alt={displayImage.alt}
				class="border-base-200 dark:border-base-800 mb-8 aspect-3/1 w-full rounded-2xl border object-cover"
			/>
		{/if}

		<!-- Two-column layout: image left, details right -->
		<div
			class="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-6 lg:grid-cols-[16rem_1fr]"
		>
			<!-- Thumbnail image (left column) -->
			{#if !isBannerOnly}
				<div class="order-1 max-w-sm md:order-0 md:col-start-1 md:max-w-none">
					{#if displayImage}
						<img
							src={displayImage.url}
							alt={displayImage.alt}
							class="border-base-200 dark:border-base-800 bg-base-200 dark:bg-base-950/50 aspect-square w-full rounded-2xl border object-cover"
						/>
					{:else}
						<div
							class="border-base-200 dark:border-base-800 aspect-square w-full overflow-hidden rounded-2xl border [&>svg]:h-full [&>svg]:w-full"
						>
							<Avatar
								size={256}
								name={data.rkey}
								variant="marble"
								colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
								square
							/>
						</div>
					{/if}
					{#if isOwner}
						<Button href="./{rkey}/edit" class="mt-9 w-full">Edit Event</Button>
						{#if data.spaceUri}
							<InviteShareFlow
								spaceUri={data.spaceUri}
								spaceKey={data.spaceKey}
								{did}
								{rkey}
								eventName={eventData.name}
								{hostProfile}
								{adapter}
								{viewer}
							/>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Right column: event details -->
			<div class="order-2 min-w-0 md:order-0 md:col-start-2 md:row-span-2 md:row-start-1">
				<div class="mb-2">
					<h1 class="text-base-900 dark:text-base-50 text-3xl leading-tight font-bold sm:text-4xl">
						{eventData.name}
					</h1>
				</div>

				<EventBadges mode={eventData.mode} {isOngoing} />

				<EventDateBlock {startDate} {endDate} />

				<EventLocationBlock {locationData} />

				<!-- Part of -->
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

				{#if !isPast}
					<EventRsvp
						{eventUri}
						eventCid={eventData.cid ?? null}
						initialRsvpStatus={data.viewerRsvpStatus}
						initialRsvpRkey={data.viewerRsvpRkey}
						spaceUri={data.spaceUri ?? null}
						{adapter}
						{viewer}
						onrsvp={handleRsvp}
						oncancel={handleRsvpCancel}
					/>
				{/if}

				<!-- Live stream -->
				{#if isOngoing && streamPlaceHandle}
					<div class="mt-8 mb-8">
						<p
							class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
						>
							Live now
						</p>
						<StreamPlacePlayer handle={streamPlaceHandle} title={eventData.name} />
					</div>
				{/if}

				<!-- About + Comments -->
				{#if descriptionHtml || hasComments}
					<div class="mt-8 mb-8">
						{#if descriptionHtml && hasComments}
							<ToggleGroup
								type="single"
								bind:value={
									() => aboutCommentsTab,
									(val) => {
										if (val === 'about' || val === 'comments') aboutCommentsTab = val;
									}
								}
								class="mb-4 w-fit"
								size="xs"
							>
								<ToggleGroupItem value="about">About</ToggleGroupItem>
								<ToggleGroupItem value="comments">Comments</ToggleGroupItem>
							</ToggleGroup>

							{#if aboutCommentsTab === 'about'}
								<div
									class="text-base-700 dark:text-base-300 prose dark:prose-invert prose-a:text-accent-600 dark:prose-a:text-accent-400 prose-a:hover:underline prose-a:no-underline max-w-none leading-relaxed wrap-break-word"
								>
									{@html descriptionHtml}
								</div>
							{:else if eventData.bskyPostRef?.uri}
								<EventComments postUri={eventData.bskyPostRef.uri} />
							{/if}
						{:else if descriptionHtml}
							<p
								class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
							>
								About
							</p>
							<div
								class="text-base-700 dark:text-base-300 prose dark:prose-invert prose-a:text-accent-600 dark:prose-a:text-accent-400 prose-a:hover:underline prose-a:no-underline max-w-none leading-relaxed wrap-break-word"
							>
								{@html descriptionHtml}
							</div>
						{:else if eventData.bskyPostRef?.uri}
							<p
								class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
							>
								Comments
							</p>
							<EventComments postUri={eventData.bskyPostRef.uri} />
						{/if}
					</div>
				{/if}

				<!-- Recording -->
				{#if data.vod}
					<div class="mt-8 mb-8">
						<p
							class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
						>
							Recording
						</p>
						<VodPlayer
							playlistUrl={data.vod.playlistUrl}
							title={eventData.name}
							subtitlesUrl="/vods/{rkey}-karaoke.vtt"
							bind:currentTime={vodCurrentTime}
							bind:api={vodApi}
						/>
					</div>
				{/if}

				<EventLocationMap {locationData} {geoLocation} />
			</div>

			<!-- Left column: sidebar info -->
			<div class="order-3 space-y-6 md:order-0 md:col-start-1">
				<EventHostedBy {hostProfile} {hostUrl} {did} {speakers} />

				<EventLinksList uris={eventData.uris} />

				<AddToCalendarButton {eventData} {eventUri} pageHref={pageUrl.href} />

				<EventAttendees
					bind:this={attendeesRef}
					going={attendees.going}
					interested={attendees.interested}
					goingCount={attendees.goingCount}
					interestedCount={attendees.interestedCount}
				/>
			</div>
		</div>
	</div>
</div>

<ShareModal
	bind:open={showShareModal}
	url={shareUrl}
	title={shareModalTitle}
	shareText={shareModalText}
	eventName={eventData.name}
	{ogImageUrl}
	{canSetEventComments}
	eventDid={did}
	eventRkey={rkey}
	eventDescription={eventData.description}
	{adapter}
	{viewer}
/>
