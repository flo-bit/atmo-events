<script lang="ts">
	import { Modal, Button, Checkbox, Label } from '@foxui/core';
	import {
		MicrobloggingPostCreator,
		editorJsonToBlueskyPost,
		createBlueskyMentionSearch,
		LinkCard,
		type MicrobloggingPostContent
	} from '@foxui/social';
	import type { JSONContent, SvelteTiptap } from '@foxui/text';
	import type { Readable } from 'svelte/store';
	import { get } from 'svelte/store';
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

	function textToDoc(text: string): JSONContent {
		const lines = text.split('\n');
		const content = lines.map((line) =>
			line.length > 0
				? { type: 'paragraph', content: [{ type: 'text', text: line }] }
				: { type: 'paragraph' }
		);
		return { type: 'doc', content } as JSONContent;
	}

	const searchMentions = createBlueskyMentionSearch();

	let postContent = $state<MicrobloggingPostContent>({
		text: initialText,
		json: textToDoc(initialText)
	});
	let editorStore = $state<Readable<SvelteTiptap.Editor> | undefined>();
	let prefilledForOpen = $state(false);
	let showComments = $state(true);
	let posting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Each time the modal opens, push the initial text into the editor once it's
	// ready. The editor instance arrives via a readable store after PlainTextEditor
	// has mounted internally, so we subscribe and write content on the first
	// non-null value we see for this open cycle.
	$effect(() => {
		if (!open) {
			prefilledForOpen = false;
			showComments = true;
			errorMessage = null;
			return;
		}
		if (!editorStore || prefilledForOpen) return;
		const unsub = editorStore.subscribe((ed) => {
			if (!ed || prefilledForOpen) return;
			ed.commands.setContent(textToDoc(initialText));
			prefilledForOpen = true;
		});
		return unsub;
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

		// Read the editor's live JSON directly — postContent only updates on the
		// editor's onupdate callback and can lag behind setContent prefills.
		const editor = editorStore ? get(editorStore) : undefined;
		const liveJson: JSONContent = editor
			? (editor.getJSON() as JSONContent)
			: postContent.json;

		posting = true;
		errorMessage = null;
		try {
			const { text, facets } = editorJsonToBlueskyPost(liveJson);

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

<Modal bind:open>
	<div class="space-y-4">
		<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Share to Bluesky</h2>

		<div
			class="border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-950/30 space-y-3 rounded-xl border p-3"
		>
			<MicrobloggingPostCreator
				bind:editor={editorStore}
				bind:content={postContent}
				{searchMentions}
				maxLength={300}
				textEditorClass="max-h-48 overflow-y-auto"
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
				<Checkbox bind:checked={showComments} />
				<span class="text-base-700 dark:text-base-300 text-sm">
					Show comments on event page
				</span>
			</Label>
		{/if}

		{#if errorMessage}
			<p class="text-red-600 dark:text-red-400 text-sm">{errorMessage}</p>
		{/if}

		<Button class="w-full" onclick={handlePost} disabled={posting}>
			{posting ? 'Posting…' : 'Post'}
		</Button>
	</div>
</Modal>
