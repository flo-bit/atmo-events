<script lang="ts">
	import { NestedComments, blueskyPostToPostData, type PostData } from '@atmo-dev/kit';

	import {
		socialClientInfo,
		socialPostUrl,
		type PreferredSocialClient
	} from '@atmo-dev/kit/social';

	let {
		postUri,
		socialClient
	}: {
		postUri: string;
		socialClient?: PreferredSocialClient | null;
	} = $props();

	let comments = $state<PostData[]>([]);
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	function threadToComments(replies: unknown[]): PostData[] {
		return (replies as Array<{ $type?: string; post?: unknown; replies?: unknown[] }>)
			.filter((r) => r.$type === 'app.bsky.feed.defs#threadViewPost' && r.post)
			.map((r) => {
				const postData = blueskyPostToPostData(
					r.post as Parameters<typeof blueskyPostToPostData>[0]
				);
				if (r.replies?.length) {
					postData.replies = threadToComments(r.replies);
				}
				return postData;
			});
	}

	async function loadThread(uri: string, signal: AbortSignal) {
		loading = true;
		errorMessage = null;
		try {
			const res = await fetch(
				`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6`,
				{ signal }
			);
			if (!res.ok) throw new Error(`Failed to load thread (${res.status})`);
			const data = (await res.json()) as { thread?: { replies?: unknown[] } };
			const thread = data.thread;
			if (!signal.aborted)
				comments = thread?.replies?.length ? threadToComments(thread.replies) : [];
		} catch (err) {
			if (signal.aborted) return;
			console.error('EventComments: load failed', err);
			errorMessage = err instanceof Error ? err.message : 'Failed to load comments';
			comments = [];
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	// Only a new thread URI should refetch; changing the viewer's client just changes links.
	let threadUri = $derived(postUri);
	$effect(() => {
		const controller = new AbortController();
		if (threadUri) loadThread(threadUri, controller.signal);
		return () => controller.abort();
	});

	let replyUrl = $derived(socialPostUrl(postUri, socialClient));
	let clientLabel = $derived(socialClientInfo(socialClient).label);
</script>

<div>
	{#if replyUrl}
		<div class="mb-4 text-sm">
			<a
				href={replyUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 font-medium"
			>
				Add a comment on {clientLabel} &rarr;
			</a>
		</div>
	{/if}

	{#if loading}
		<p class="text-muted text-sm">Loading comments…</p>
	{:else if errorMessage}
		<p class="text-muted text-sm">{errorMessage}</p>
	{:else if comments.length === 0}
		<p class="text-muted text-sm">No comments yet.</p>
	{:else}
		<div class="not-prose comments-no-divider">
			<NestedComments {comments} {socialClient} />
		</div>
	{/if}
</div>

<style>
	.comments-no-divider :global(> div) {
		border-top-width: 0;
	}
</style>
