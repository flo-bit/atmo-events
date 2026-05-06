<script lang="ts" module>
	export type VodPlayerApi = {
		seek: (time: number) => void;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import 'plyr/dist/plyr.css';
	import type HlsType from 'hls.js';
	import type PlyrType from 'plyr';

	let {
		playlistUrl,
		title,
		subtitlesUrl,
		currentTime = $bindable(0),
		api = $bindable(undefined)
	}: {
		playlistUrl: string;
		title: string;
		subtitlesUrl?: string;
		currentTime?: number;
		api?: VodPlayerApi;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let error = $state(false);

	let hls: HlsType | null = null;
	let plyr: PlyrType | null = null;

	api = {
		seek(time: number) {
			if (plyr) {
				plyr.currentTime = time;
				plyr.play();
			}
		}
	};

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
				controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'fullscreen'],
				settings: ['captions', 'speed'],
				speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
				captions: { active: !!subtitlesUrl, language: 'en', update: true },
				ratio: '16:9'
			});

			plyr.on('play', () => {
				hls?.startLoad();
			});

			plyr.on('timeupdate', () => {
				currentTime = plyr?.currentTime ?? 0;
			});

			// Add track after Plyr init and force captions on
			if (subtitlesUrl) {
				const media = videoEl;
				// Remove any existing tracks first
				media.querySelectorAll('track').forEach((t) => t.remove());
				// Add fresh track
				const track = document.createElement('track');
				track.kind = 'captions';
				track.label = 'English';
				track.srclang = 'en';
				track.src = subtitlesUrl;
				track.default = true;
				media.appendChild(track);
				// Wait for track to load, then activate
				track.addEventListener('load', () => {
					plyr!.toggleCaptions(true);
				});
				// Also try toggling after a short delay as fallback
				setTimeout(() => plyr?.toggleCaptions(true), 500);
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
	<div class="border-base-300 dark:border-base-400/40 aspect-video w-full max-w-full overflow-hidden rounded-xl border">
		<video bind:this={videoEl} class="h-full w-full" aria-label={title} crossorigin="anonymous"></video>
	</div>
{/if}

<style>
	* {
		--plyr-color-main: var(--color-accent-500);
	}
</style>
