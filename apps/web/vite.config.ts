import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { fileURLToPath } from 'node:url';
import { DEV_PORT } from './src/lib/atproto/port';
import { unwasm } from 'unwasm/plugin';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	resolve: { dedupe: ['svelte', 'bits-ui', '@internationalized/date'] },
	build: {
		rollupOptions: {
			// Emits `*.wasm?module` imports (Takumi's OG renderer) as Worker WASM modules.
			plugins: [unwasm({ esmImport: true, lazy: true })]
		}
	},
	server: {
		// The unpublished kit and its font assets live outside this workspace.
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				fileURLToPath(new URL('../../../00-atmo-kit/kit', import.meta.url))
			]
		},
		host: '127.0.0.1',
		port: DEV_PORT,
		allowedHosts: ['described-yamaha-fame-social.trycloudflare.com']
	}
});
