<script lang="ts">
	import {
		Modal,
		Button,
		Checkbox,
		Label,
		PostComposer,
		editorJsonToBlueskyPost,
		createActorSearch,
		LinkCard,
		textToDoc,
		graphemeLength,
		type Editor
	} from '@atmo-dev/kit';
	import { tokenize } from '@atcute/bluesky-richtext-parser';
	import { tokensToFacets } from './editor/save.js';
	import type { EditorAdapter, EditorViewer } from './editor/adapter.js';

	let {
		open = $bindable(false),
		canSetEventComments = false,
		eventDid,
		eventRkey,
		eventName,
		eventUrl,
		eventDescription,
		ogImageUrl,
		initialText,
		adapter,
		viewer,
		onPosted
	}: {
		open: boolean;
		canSetEventComments?: boolean;
		eventDid: string;
		eventRkey: string;
		eventName: string;
		eventUrl: string;
		eventDescription?: string;
		ogImageUrl?: string;
		initialText: string;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		onPosted?: (ref: { uri: string; cid: string; showComments: boolean }) => void;
	} = $props();

	const searchActors = createActorSearch();
	let text = $state('');
	let editor = $state<Editor | null>(null);
	let prefilledForOpen = $state(false);
	let showComments = $state(true);
	let posting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Seed once per opening, after the lazy editor has mounted.
	$effect(() => {
		if (!open) {
			prefilledForOpen = false;
			showComments = true;
			errorMessage = null;
			return;
		}
		if (!editor || prefilledForOpen) return;
		text = initialText;
		editor.commands.setContent(textToDoc(initialText));
		prefilledForOpen = true;
	});

	// Bluesky's external embed accepts a thumb blob up to ~1MB. Fetch the OG
	// image, upload it to the user's PDS, return a clean blob ref. On any failure
	// (CORS, large image, network) we fall back to a thumb-less embed rather than
	// blocking the post.
	async function fetchAndUploadThumbnail(url: string) {
		try {
			const resp = await fetch(url);
			if (!resp.ok) return null;
			const blob = await resp.blob();
			if (!blob.type.startsWith('image/')) return null;
			if (blob.size > 1_000_000) return null;
			const result = await adapter.uploadBlob(blob);
			return {
				$type: result.$type,
				ref: result.ref,
				mimeType: result.mimeType,
				size: result.size
			};
		} catch (err) {
			console.warn('PostToBlueskyModal: thumbnail upload failed, posting without thumb', err);
			return null;
		}
	}

	async function handlePost() {
		if (!viewer.did || posting) return;

		const liveJson = editor?.getJSON() ?? textToDoc(text);

		posting = true;
		errorMessage = null;
		try {
			const { text, facets } = editorJsonToBlueskyPost(liveJson);
			if (graphemeLength(text) > 300 || new TextEncoder().encode(text).length > 3000) {
				errorMessage = 'Posts must be 300 characters or fewer.';
				return;
			}
			// Also recognize handles typed or pasted without selecting a suggestion.
			const detected = await tokensToFacets(tokenize(text), (handle) =>
				adapter.resolveHandle(handle)
			);
			for (const facet of detected) {
				const index = facet.index;
				if (
					!facets.some(
						(existing) =>
							index.byteStart < existing.index.byteEnd && index.byteEnd > existing.index.byteStart
					)
				)
					facets.push(facet);
			}
			facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

			if (!text.trim()) {
				errorMessage = 'Post text cannot be empty';
				posting = false;
				return;
			}

			const externalEmbed: Record<string, unknown> = {
				uri: eventUrl,
				title: eventName,
				description: eventDescription ?? ''
			};
			if (ogImageUrl) {
				const thumb = await fetchAndUploadThumbnail(ogImageUrl);
				if (thumb) externalEmbed.thumb = thumb;
			}

			const postRecord: Record<string, unknown> = {
				$type: 'app.bsky.feed.post',
				text,
				createdAt: new Date().toISOString(),
				embed: {
					$type: 'app.bsky.embed.external',
					external: externalEmbed
				}
			};
			if (facets.length > 0) postRecord.facets = facets;

			const postResp = await adapter.createRecord({
				collection: 'app.bsky.feed.post',
				record: postRecord
			});
			if (!postResp.uri || !postResp.cid) {
				console.error('PostToBlueskyModal: PDS response missing uri/cid', postResp);
				throw new Error(
					'PDS rejected the post — try logging out and back in to refresh permissions'
				);
			}
			const postUri = postResp.uri;
			const postCid = postResp.cid;

			if (canSetEventComments) {
				const fresh = await adapter.getRecord({
					did: eventDid,
					collection: 'community.lexicon.calendar.event',
					rkey: eventRkey
				});
				const updatedRecord = {
					...fresh.value,
					bskyPostRef: {
						uri: postUri,
						cid: postCid,
						showComments
					}
				};
				await adapter.putRecord({
					collection: 'community.lexicon.calendar.event',
					rkey: eventRkey,
					record: updatedRecord
				});

				await adapter.notifyUpdate?.(
					`at://${eventDid}/community.lexicon.calendar.event/${eventRkey}`
				);
			}

			onPosted?.({ uri: postUri, cid: postCid, showComments });
			open = false;
		} catch (err) {
			console.error('PostToBlueskyModal: post failed', err);
			errorMessage = err instanceof Error ? err.message : 'Failed to post';
		} finally {
			posting = false;
		}
	}
</script>

<Modal bind:open title="Share to Bluesky" dismissible={!posting}>
	<div class="space-y-4">
		<div
			class="border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-950/30 space-y-3 rounded-xl border p-3"
		>
			<PostComposer
				bind:editor
				bind:value={text}
				{searchActors}
				disabled={posting}
				maxLength={300}
			/>
			<LinkCard
				href={eventUrl}
				meta={{
					title: eventName,
					description: eventDescription,
					image: ogImageUrl
				}}
			/>
		</div>

		{#if canSetEventComments}
			<Label class="flex items-center gap-2">
				<Checkbox bind:checked={showComments} disabled={posting} />
				<span class="text-base-700 dark:text-base-300 text-sm"> Show comments on event page </span>
			</Label>
		{/if}

		{#if errorMessage}
			<p role="alert" class="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
		{/if}

		<Button
			class="w-full"
			onclick={handlePost}
			disabled={posting || !text.trim() || graphemeLength(text) > 300}
		>
			{posting ? 'Posting…' : 'Post'}
		</Button>
	</div>
</Modal>
