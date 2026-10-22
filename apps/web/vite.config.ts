import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { DEV_PORT } from './src/lib/atproto/port';
import { unwasm } from 'unwasm/plugin';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	build: {
		rollupOptions: {
			// Emits `*.wasm?module` imports (Takumi's OG renderer) as Worker WASM modules.
			plugins: [unwasm({ esmImport: true, lazy: true })]
		}
	},
	server: {
		host: '127.0.0.1',
		port: DEV_PORT,
		allowedHosts: ['described-yamaha-fame-social.trycloudflare.com']
	}
});
