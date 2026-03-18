import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { DEV_PORT } from './src/lib/atproto/port';
import { sveltekitOG } from '@ethercorps/sveltekit-og/plugin';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss(), sveltekitOG()],
	server: {
		host: '127.0.0.1',
		port: DEV_PORT,
		allowedHosts: []
	}
});
