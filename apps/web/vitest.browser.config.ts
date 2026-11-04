import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';

const kitRoot = dirname(dirname(createRequire(import.meta.url).resolve('@atmo-dev/kit/theme.css')));
const appFixture = fileURLToPath(new URL('./src/lib/meet/test-app.ts', import.meta.url));
const publicEnvFixture = fileURLToPath(
	new URL('./src/lib/atproto/test-env-public.ts', import.meta.url)
);

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	optimizeDeps: {
		// Keep shared network settings in one module; Vite also handles MapLibre's worker ?url.
		exclude: ['@atmo-dev/kit/events', '@atmo-dev/kit/events-data'],
		include: [
			'@sketchyicons/svelte/icons/calendar',
			'@sketchyicons/svelte/icons/message-circle',
			'@sketchyicons/svelte/icons/handshake'
		]
	},
	server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), kitRoot] } },
	resolve: {
		dedupe: ['svelte', 'bits-ui', '@internationalized/date'],
		alias: {
			'#lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$app/state': appFixture,
			'$app/forms': appFixture,
			'$app/navigation': appFixture,
			'$app/paths': appFixture,
			'$app/env/public': publicEnvFixture
		}
	},
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
