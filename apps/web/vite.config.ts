import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { DEV_PORT } from './src/lib/atproto/port';
import { unwasm } from 'unwasm/plugin';

const kitRoot = dirname(dirname(createRequire(import.meta.url).resolve('@atmo-dev/kit/theme.css')));

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	resolve: { dedupe: ['svelte', 'bits-ui', '@internationalized/date'] },
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
		allowedHosts: ['described-yamaha-fame-social.trycloudflare.com']
	}
});
