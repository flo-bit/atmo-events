import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Preprocessing for svelte-package and the standalone Svelte Vite plugin.
const config = {
	preprocess: vitePreprocess()
};

export default config;
