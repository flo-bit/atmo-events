import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';

const kitRoot = dirname(dirname(createRequire(import.meta.url).resolve('@atmo-dev/kit/theme.css')));

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	resolve: { dedupe: ['svelte', 'bits-ui', '@internationalized/date'] },
	server: {
		fs: { allow: [searchForWorkspaceRoot(process.cwd()), kitRoot] }
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
