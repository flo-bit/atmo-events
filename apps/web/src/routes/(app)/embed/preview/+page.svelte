<script lang="ts">
	let eventUrl = $state('');
	let viewerDid = $state('');
	let base = $state('');
	let accent = $state('');
	let dark = $state(false);

	let embedSrc = $derived(eventUrl ? toEmbedUrl(eventUrl) : '');

	const sizes = [
		{ label: '300 × 150', width: 300, height: 150 },
		{ label: '400 × 200', width: 400, height: 200 },
		{ label: '600 × 300', width: 600, height: 300 }
	];

	let selectedSize = $state(sizes[1]);

	function toEmbedUrl(url: string): string {
		try {
			const u = new URL(url, 'https://atmo.rsvp');
			const match = u.pathname.match(/\/p\/([^/]+)\/e\/([^/]+)/);
			if (!match) return '';
			const embedPath = `/embed/p/${match[1]}/e/${match[2]}`;
			const params = new URLSearchParams();
			if (viewerDid) params.set('did', viewerDid);
			if (base) params.set('base', base);
			if (accent) params.set('accent', accent);
			if (dark) params.set('dark', '1');
			const qs = params.toString();
			return `${embedPath}${qs ? `?${qs}` : ''}`;
		} catch {
			return '';
		}
	}
</script>

<svelte:head>
	<title>Embed Preview</title>
</svelte:head>

<div class="min-h-screen px-6 py-12">
	<div class="mx-auto max-w-3xl">
		<h1 class="text-base-900 dark:text-base-50 mb-8 text-2xl font-bold">Embed Preview</h1>

		<!-- URL input -->
		<div class="mb-4">
			<label for="event-url" class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">Event URL</label>
			<input
				id="event-url"
				type="text"
				bind:value={eventUrl}
				placeholder="https://atmo.rsvp/p/actor/e/rkey"
				class="border-base-300 dark:border-base-700 bg-base-100 dark:bg-base-800 text-base-900 dark:text-base-50 placeholder:text-base-400 dark:placeholder:text-base-500 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
			/>
		</div>

		<!-- Params -->
		<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div>
				<label for="viewer-did" class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">Viewer DID</label>
				<input
					id="viewer-did"
					type="text"
					bind:value={viewerDid}
					placeholder="did:plc:..."
					class="border-base-300 dark:border-base-700 bg-base-100 dark:bg-base-800 text-base-900 dark:text-base-50 placeholder:text-base-400 dark:placeholder:text-base-500 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
				/>
			</div>
			<div>
				<label for="base-color" class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">Base</label>
				<input
					id="base-color"
					type="text"
					bind:value={base}
					placeholder="mauve"
					class="border-base-300 dark:border-base-700 bg-base-100 dark:bg-base-800 text-base-900 dark:text-base-50 placeholder:text-base-400 dark:placeholder:text-base-500 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
				/>
			</div>
			<div>
				<label for="accent-color" class="text-base-700 dark:text-base-300 mb-1 block text-sm font-medium">Accent</label>
				<input
					id="accent-color"
					type="text"
					bind:value={accent}
					placeholder="fuchsia"
					class="border-base-300 dark:border-base-700 bg-base-100 dark:bg-base-800 text-base-900 dark:text-base-50 placeholder:text-base-400 dark:placeholder:text-base-500 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
				/>
			</div>
			<div class="flex items-end">
				<label class="text-base-700 dark:text-base-300 flex items-center gap-2 text-sm font-medium">
					<input type="checkbox" bind:checked={dark} class="accent-accent-600 size-4 rounded" />
					Dark mode
				</label>
			</div>
		</div>

		<!-- Size selector -->
		<div class="mb-8 flex gap-2">
			{#each sizes as size}
				<button
					onclick={() => selectedSize = size}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {selectedSize === size
						? 'bg-accent-600 text-white'
						: 'bg-base-200 dark:bg-base-800 text-base-700 dark:text-base-300 hover:bg-base-300 dark:hover:bg-base-700'}"
				>
					{size.label}
				</button>
			{/each}
		</div>

		<!-- Preview -->
		{#if embedSrc}
			<div class="mb-4">
				<p class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase">
					Preview ({selectedSize.label})
				</p>
				<div class="border-base-300 dark:border-base-700 inline-block rounded-xl border p-1">
					<iframe
						src={embedSrc}
						width={selectedSize.width}
						height={selectedSize.height}
						title="Embed preview"
						class="rounded-lg"
						sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					></iframe>
				</div>
			</div>

			<div class="mb-4">
				<p class="text-base-500 dark:text-base-400 mb-2 text-xs font-semibold tracking-wider uppercase">
					Embed URL
				</p>
				<code class="text-base-600 dark:text-base-400 bg-base-100 dark:bg-base-800 block rounded-lg p-3 text-xs break-all">
					{embedSrc}
				</code>
			</div>
		{:else}
			<p class="text-base-400 dark:text-base-500 text-sm">
				Enter an event URL above to preview the embed.
			</p>
		{/if}
	</div>
</div>
