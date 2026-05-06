import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		alias: {
			'@atmo-dev/events-ui': '../../packages/ui/src'
		},
		experimental: {
			remoteFunctions: true
		}
	}
};

export default config;
