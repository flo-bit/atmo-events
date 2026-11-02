import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv, searchForWorkspaceRoot } from 'vite';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { DEV_PORT } from './src/lib/atproto/settings.ts';
import { unwasm } from 'unwasm/plugin';

const kitRoot = dirname(dirname(createRequire(import.meta.url).resolve('@atmo-dev/kit/theme.css')));
const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
	const { OAUTH_PUBLIC_URL, LOCAL_STATE_DIR } = loadEnv(mode, process.cwd(), [
		'OAUTH_PUBLIC_URL',
		'LOCAL_STATE_DIR'
	]);
	return {
		plugins: [
			sveltekit({
				preprocess: vitePreprocess(),
				// LOCAL_STATE_DIR, relative to apps/web, keeps the dev server's local D1, KV and R2
				// somewhere other than .wrangler/state; wrangler's --local --persist-to <it> reads them.
				// snowglobe.yml sets it, because contrail ties a database to the first Jetstream it
				// reads, so another atproto network needs a database of its own.
				adapter: adapter(
					LOCAL_STATE_DIR
						? { platformProxy: { persist: { path: resolve(webRoot, LOCAL_STATE_DIR, 'v3') } } }
						: {}
				),
				experimental: { remoteFunctions: true }
			}),
			tailwindcss()
		],
		resolve: {
			alias: {
				// OAuth 0.4.1 supports Kit 3 but its bundle retains this Kit 2 import.
				'$app/environment': '$app/env',
				'@atmo-dev/events-ui': fileURLToPath(new URL('../../packages/ui/src', import.meta.url)),
				...(process.env.VITEST
					? {
							'cloudflare:workers': fileURLToPath(
								new URL('./src/test/cloudflare.ts', import.meta.url)
							)
						}
					: {})
			},
			dedupe: ['svelte', 'bits-ui', '@internationalized/date']
		},
		test: {
			setupFiles: ['./src/test/setup.ts'],
			exclude: [...configDefaults.exclude, '**/*.browser.spec.ts']
		},
		// Transform the country helper's JSON datasets during SSR (including Vitest).
		// The helper intentionally does not import this package's CommonJS runtime.
		ssr: { noExternal: ['i18n-iso-countries'] },
		build: {
			rollupOptions: {
				// Emits `*.wasm?module` imports (Takumi's OG renderer) as Worker WASM modules.
				plugins: [unwasm({ esmImport: true, lazy: true })]
			}
		},
		server: {
			// Local kit builds and font assets may live outside this workspace.
			fs: { allow: [searchForWorkspaceRoot(process.cwd()), kitRoot] },
			host: '127.0.0.1',
			port: DEV_PORT,
			allowedHosts: OAUTH_PUBLIC_URL ? [new URL(OAUTH_PUBLIC_URL).hostname] : []
		}
	};
});
