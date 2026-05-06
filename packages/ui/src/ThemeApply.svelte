<script lang="ts">
	import { BROWSER as browser } from 'esm-env';

	let {
		accentColor = 'cyan',
		baseColor = 'mist'
	}: {
		accentColor?: string;
		baseColor?: string;
	} = $props();

	const allAccentColors = [
		'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
		'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
		'fuchsia', 'pink', 'rose'
	];
	const allBaseColors = [
		'gray', 'stone', 'zinc', 'neutral', 'slate', 'mist', 'sand',
		'olive', 'mauve', 'sage'
	];

	const allColors = [...allAccentColors, ...allBaseColors];

	const safeJson = (v: string) => JSON.stringify(v).replace(/</g, '\\u003c');

	// SSR: inline script that removes all color classes then adds the correct ones before paint
	const allColorsJson = JSON.stringify(allColors);

	let script = $derived(
		`<script>(function(){var e=document.documentElement,r=${allColorsJson};r.forEach(function(c){e.classList.remove(c)});e.classList.add(${safeJson(accentColor)},${safeJson(baseColor)});})()<` +
			'/script>'
	);

	// Client: reactive effect for client-side navigations
	$effect(() => {
		if (!browser) return;
		const el = document.documentElement;
		el.classList.remove(...allColors);
		el.classList.add(accentColor, baseColor);

		return () => {
			el.classList.remove(...allColors);
			el.classList.add('cyan', 'mist');
		};
	});
</script>

<svelte:head>
	{@html script}
</svelte:head>
