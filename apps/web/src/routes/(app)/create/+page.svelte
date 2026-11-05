<script lang="ts">
	import { EventEditor, type EventEditorPrefill } from '@atmo-dev/kit/events';
	import { onMount } from 'svelte';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { createInAppAdapter } from '#lib/components/editor/adapter.js';
	import { readPendingImportPrefill } from '#lib/components/CreateEventModal.svelte';
	import { page } from '$app/state';
	import PrivateEventAccessNotice from '#lib/private-events/components/PrivateEventAccessNotice.svelte';
	import { createPrivateEventAdapter } from '#lib/private-events/editor-adapter.js';
	import { HOST_SCOPES } from '#lib/private-events/scopes.js';

	let { data } = $props();

	// No default where there's a choice: a public post can't be taken back. Coming back from the
	// permission step, the choice is already made.
	const INVITED = 'invited';
	let audience = $state<'everyone' | typeof INVITED | null>(
		page.url.searchParams.get('audience') === INVITED ? INVITED : null
	);
	let invited = $derived(data.privateEvents && audience === INVITED);
	let chosen = $derived(!data.privateEvents || audience === 'everyone' || invited);

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		canPostToBluesky: user.canPostToBluesky,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(
		invited
			? createPrivateEventAdapter({ ...viewer, canPostToBluesky: false })
			: createInAppAdapter({ viewer })
	);

	// Pulled out of sessionStorage on mount so the editor sees it on its first
	// pass. EventEditor only reads `prefill` in its own onMount, so we gate
	// rendering until after this runs.
	let prefill: EventEditorPrefill | null = $state(null);
	let ready = $state(false);
	onMount(async () => {
		const pending = readPendingImportPrefill();
		if (!pending) {
			ready = true;
			return;
		}
		let thumbnailFile: File | undefined;
		if (pending.imageDataUrl) {
			try {
				const blob = await (await fetch(pending.imageDataUrl)).blob();
				const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
				thumbnailFile = new File([blob], `imported-cover.${ext}`, { type: blob.type });
			} catch (err) {
				console.error('Could not decode imported cover image:', err);
			}
		}
		prefill = {
			name: pending.name,
			description: pending.description,
			startsAt: pending.startsAt,
			endsAt: pending.endsAt,
			timezone: pending.timezone,
			mode: pending.mode,
			location: pending.location,
			links: pending.links,
			additionalData: pending.additionalData,
			...(thumbnailFile ? { thumbnailFile } : {})
		};
		ready = true;
	});
</script>

{#if data.privateEvents}
	<div class="mx-auto max-w-2xl px-6 pt-12" data-testid="audience">
		<fieldset>
			<legend class="text-base-900 dark:text-base-50 text-lg font-semibold">
				Who can see this event?
			</legend>
			<label class="mt-3 flex items-start gap-3">
				<input type="radio" name="audience" class="mt-1" value="everyone" bind:group={audience} />
				<span>
					<span class="font-medium">Everyone</span>
					<span class="text-muted block text-sm"
						>Anyone can see it, and it can't be made private later.</span
					>
				</span>
			</label>
			<label class="mt-3 flex items-start gap-3">
				<input type="radio" name="audience" class="mt-1" value={INVITED} bind:group={audience} />
				<span>
					<span class="font-medium">Invited people only</span>
					<span class="text-muted block text-sm"
						>Only people you add can see it, and it can't be made public later. It has no image or
						repeats for now.</span
					>
				</span>
			</label>
		</fieldset>
		{#if invited && data.hostAccess}
			<PrivateEventAccessNotice
				access={data.hostAccess}
				did={data.actorDid}
				scopes={HOST_SCOPES}
				purpose="A private event is kept on your own server. atmo needs your permission to create it there and manage its guest list."
				label="Allow atmo to host private events"
				returnTo="/create?audience={INVITED}"
				spacesServer={data.spacesServer}
			/>
		{/if}
	</div>
{/if}

{#if ready && chosen && !(invited && data.hostAccess)}
	{#key invited}
		<EventEditor
			eventData={null}
			actorDid={data.actorDid}
			rkey={data.rkey}
			{adapter}
			{viewer}
			{prefill}
		/>
	{/key}
{/if}
