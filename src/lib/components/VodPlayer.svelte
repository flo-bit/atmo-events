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

	onMount(() => {
		init();
		return () => {
			hls?.destroy();
			plyr?.destroy();
		};
	});

	async function init() {
		if (!videoEl) return;

		try {
			const [{ default: Plyr }, { default: Hls }] = await Promise.all([
				import('plyr'),
				import('hls.js')
			]);

			if (Hls.isSupported()) {
				hls = new Hls({ autoStartLoad: false });
				hls.loadSource(playlistUrl);
				hls.attachMedia(videoEl);
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
			} else {
				error = true;
				return;
			}

			plyr = new Plyr(videoEl, {
				controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
				settings: ['speed'],
				speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
				ratio: '16:9'
			});

			// When user clicks play, tell HLS to start loading segments
			plyr.on('play', () => {
				hls?.startLoad();
			});
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
	<div class="border-base-300 dark:border-base-400/40 aspect-video w-full max-w-full overflow-hidden rounded-xl border">
		<video bind:this={videoEl} class="h-full w-full" aria-label={title}></video>
	</div>
{/if}

<style>
	* {
		--plyr-color-main: var(--color-accent-500);
	}
</style>
