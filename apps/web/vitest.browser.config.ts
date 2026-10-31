import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	resolve: { dedupe: ['svelte', 'bits-ui', '@internationalized/date'] },
	test: {
		include: ['src/**/*.browser.spec.ts'],
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true,
			viewport: { width: 1280, height: 1000 }
		}
	}
});
