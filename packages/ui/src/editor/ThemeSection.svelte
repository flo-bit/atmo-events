<script lang="ts">
	import { Palette } from '@sketchyicons/svelte';
	import { Button, Icon, Modal } from '@atmo-dev/kit';
	import ThemePicker from '../ThemePicker.svelte';
	import { themeBackgrounds, type EventTheme } from '../theme.js';

	let { theme = $bindable() }: { theme: EventTheme } = $props();

	let showModal = $state(false);
</script>

<div>
	<p class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase">
		Theme
	</p>
	<Button variant="secondary" size="sm" onclick={() => (showModal = true)}>
		<Icon img={Palette} size={16} />
		{themeBackgrounds[theme.name] || theme.name}
	</Button>
</div>

<Modal bind:open={showModal} title="Event theme">
	<div class="mt-4">
		<ThemePicker bind:theme />
	</div>
</Modal>
