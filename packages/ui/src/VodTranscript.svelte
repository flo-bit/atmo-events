<script lang="ts">
	import { onMount } from 'svelte';

	type Word = { text: string; start: number; end: number };
	type Segment = { start: number; end: number; text: string; words: Word[] };

	let {
		transcriptUrl,
		currentTime = 0,
		onseek
	}: {
		transcriptUrl: string;
		currentTime?: number;
		onseek?: (time: number) => void;
	} = $props();

	let segments: Segment[] = $state([]);
	let loaded = $state(false);

	onMount(() => {
		fetchTranscript();
	});

	async function fetchTranscript() {
		try {
			const res = await fetch(transcriptUrl);
			segments = await res.json();
		} catch {
			segments = [];
		}
		loaded = true;
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function wordClass(word: Word): string {
		if (currentTime >= word.start && currentTime < word.end) {
			return 'text-accent-500 font-semibold';
		}
		if (word.end <= currentTime) {
			return 'text-base-900 dark:text-base-100';
		}
		return 'text-base-400 dark:text-base-500';
	}
</script>

{#if loaded && segments.length > 0}
	<div class="max-h-[400px] overflow-y-auto rounded-xl px-4 py-6">
		{#each segments as segment, i (segment.start)}
			<p class="mb-2">
				<button
					type="button"
					onclick={() => onseek?.(segment.start)}
					class="text-base-400 dark:text-base-500 mr-1 cursor-pointer font-mono text-xs transition-colors hover:text-accent-500"
				>
					{formatTime(segment.start)}
				</button>
				{#each segment.words as word, wi (`${segment.start}-${wi}`)}
					<button
						type="button"
						onclick={() => onseek?.(word.start)}
						class="{wordClass(word)} mr-1.5 cursor-pointer text-sm leading-relaxed transition-colors hover:text-accent-500"
					>{word.text.trim()}</button>
				{/each}
			</p>
		{/each}
	</div>
{/if}
