<script lang="ts">
	import EventEditor from '$lib/components/EventEditor.svelte';
	import { onMount } from 'svelte';
	import { createBlentoAdapter, type EditorViewer } from '$lib/components/editor/adapter';
	import type { EventTheme } from '$lib/theme';

	let { data } = $props();

	type Session = {
		did: string;
		handle?: string;
		displayName?: string;
		avatar?: string;
	};

	let ready = $state(false);
	let session = $state<Session | null>(null);

	let viewer = $derived<EditorViewer>({
		isLoggedIn: !!session,
		did: session?.did ?? null,
		handle: session?.handle,
		displayName: session?.displayName,
		avatar: session?.avatar
	});
	let adapter = $derived(createBlentoAdapter({ viewer }));

	// Inherit the embedder's theme so new events default to the surrounding
	// palette rather than a random accent.
	let initialTheme = $state<Partial<EventTheme> | undefined>(undefined);

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const accent = params.get('accent');
		const base = params.get('base');
		if (accent || base) {
			initialTheme = {
				...(accent ? { accentColor: accent } : {}),
				...(base ? { baseColor: base } : {})
			};
		}

		if (!window.Blento) return;
		let unsubscribe: (() => void) | undefined;
		let cancelled = false;
		(async () => {
			try {
				await window.Blento!.ready;
			} catch {
				return;
			}
			if (cancelled) return;
			session = window.Blento!.getSession();
			ready = true;
			unsubscribe = window.Blento!.on('session', (s) => {
				session = s;
			});
		})();
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	});
</script>

<svelte:head>
	<!-- Apply theme classes before paint to avoid flash -->
	<script>
		var p = new URLSearchParams(location.search);
		var h = document.documentElement;
		var b = p.get('base');
		if (b) h.classList.add(b);
		var a = p.get('accent');
		if (a) h.classList.add(a);
		if (p.get('dark') === '1') h.classList.add('dark');
	</script>
	<script src="https://blento.app/embed/v0/sdk.js"></script>
</svelte:head>

{#if !ready}
	<div class="bg-base-50 dark:bg-base-950 flex h-full items-center justify-center">
		<div
			class="border-base-300 dark:border-base-700 border-t-accent-600 size-6 animate-spin rounded-full border-2"
		></div>
	</div>
{:else}
	<EventEditor
		eventData={null}
		actorDid={viewer.did ?? ''}
		rkey={data.rkey}
		{adapter}
		{viewer}
		{initialTheme}
	/>
{/if}
