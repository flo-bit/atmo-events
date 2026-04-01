<script lang="ts">
	import { onMount } from 'svelte';
	import 'plyr/dist/plyr.css';
	import type HlsType from 'hls.js';
	import type PlyrType from 'plyr';

	let { playlistUrl, title }: { playlistUrl: string; title: string } = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let error = $state(false);

	let hls: HlsType | null = null;
	let plyr: PlyrType | null = null;
	let hlsLoaded = false;

	onMount(() => {
		initPlyr();
		return () => {
			hls?.destroy();
			plyr?.destroy();
		};
	});

	async function initPlyr() {
		if (!videoEl) return;

		try {
			const { default: Plyr } = await import('plyr');
			plyr = new Plyr(videoEl, {
				controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
				ratio: '16:9'
			});
			// Load HLS source only when user clicks play
			plyr.on('play', loadHls);
		} catch {
			error = true;
		}
	}

	async function loadHls() {
		if (!videoEl || hlsLoaded) return;
		hlsLoaded = true;

		try {
			const { default: Hls } = await import('hls.js');

			if (Hls.isSupported()) {
				hls = new Hls({
					maxBufferLength: 10,
					maxMaxBufferLength: 30,
					maxBufferSize: 30 * 1000 * 1000,
					startLevel: 0,
				});
				hls.loadSource(playlistUrl);
				hls.attachMedia(videoEl);
				hls.on(Hls.Events.MANIFEST_PARSED, () => {
					videoEl?.play();
				});
				hls.on(Hls.Events.ERROR, (_event, data) => {
					if (data.fatal) {
						if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
							hls?.startLoad();
						} else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
							hls?.recoverMediaError();
						} else {
							error = true;
						}
					}
				});
			} else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
				videoEl.src = playlistUrl;
				videoEl.play();
			} else {
				error = true;
			}
		} catch {
			error = true;
		}
	}
</script>

{#if error}
	<div class="bg-base-100 dark:bg-base-900 border-base-200 dark:border-base-800 flex aspect-video w-full items-center justify-center rounded-xl border">
		<p class="text-base-500 dark:text-base-400 text-sm">Failed to load video</p>
	</div>
{:else}
	<div class="border-base-300 dark:border-base-400/40 w-full max-w-full overflow-hidden rounded-xl border">
		<video bind:this={videoEl} class="h-full w-full" aria-label={title}></video>
	</div>
{/if}

<style>
	* {
		--plyr-color-main: var(--color-accent-500);
	}
</style>
