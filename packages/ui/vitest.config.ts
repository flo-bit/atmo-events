import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot } from 'vite';

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	resolve: { dedupe: ['svelte', 'bits-ui', '@internationalized/date'] },
	server: {
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				fileURLToPath(new URL('../../../00-atmo-kit/kit', import.meta.url))
			]
		}
	},
	test: {
		include: ['tests/**/*.svelte.spec.ts'],
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true,
			viewport: { width: 1280, height: 1000 }
		}
	}
});
