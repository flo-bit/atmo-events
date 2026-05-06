<script lang="ts">
	import {
		NestedComments,
		blueskyPostToPostData,
		type PostData
	} from '@foxui/social';

	let { postUri }: { postUri: string } = $props();

	let comments = $state<PostData[]>([]);
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	function threadToComments(replies: unknown[]): PostData[] {
		return (replies as Array<{ $type?: string; post?: unknown; replies?: unknown[] }>)
			.filter((r) => r.$type === 'app.bsky.feed.defs#threadViewPost' && r.post)
			.map((r) => {
				const { postData, embeds } = blueskyPostToPostData(
					r.post as Parameters<typeof blueskyPostToPostData>[0]
				);
				postData.embeds = embeds;
				if (r.replies?.length) {
					postData.replies = threadToComments(r.replies);
				}
				return postData;
			});
	}

	function bskyWebUrl(atUri: string): string | null {
		const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
		if (!m) return null;
		return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
	}

	async function loadThread(uri: string) {
		loading = true;
		errorMessage = null;
		try {
			const res = await fetch(
				`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6`
			);
			if (!res.ok) throw new Error(`Failed to load thread (${res.status})`);
			const data = (await res.json()) as { thread?: { replies?: unknown[] } };
			const thread = data.thread;
			comments = thread?.replies?.length ? threadToComments(thread.replies) : [];
		} catch (err) {
			console.error('EventComments: load failed', err);
			errorMessage = err instanceof Error ? err.message : 'Failed to load comments';
			comments = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (postUri) loadThread(postUri);
	});

	let replyUrl = $derived(bskyWebUrl(postUri));
</script>

<style>
	.comments-no-divider :global(> div) {
		border-top-width: 0;
	}
</style>

<div>
	{#if replyUrl}
		<div class="mb-4 text-sm">
			<a
				href={replyUrl}
				target="_blank"
				rel="noopener"
				class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 font-medium"
			>
				Add a comment on bluesky &rarr;
			</a>
		</div>
	{/if}

	{#if loading}
		<p class="text-base-500 dark:text-base-400 text-sm">Loading comments…</p>
	{:else if errorMessage}
		<p class="text-base-500 dark:text-base-400 text-sm">{errorMessage}</p>
	{:else if comments.length === 0}
		<p class="text-base-500 dark:text-base-400 text-sm">No comments yet.</p>
	{:else}
		<div class="not-prose comments-no-divider">
			<NestedComments
				{comments}
				actions={(comment) => ({
					reply: { count: comment.replyCount, href: comment.href },
					like: { count: comment.likeCount, href: comment.href }
				})}
			/>
		</div>
	{/if}
</div>
