import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { DEV_PORT } from './src/lib/atproto/port';
import { sveltekitOG } from '@ethercorps/sveltekit-og/plugin';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss(), sveltekitOG()],
	server: {
		host: '127.0.0.1',
		port: DEV_PORT,
		allowedHosts: ['described-yamaha-fame-social.trycloudflare.com'],
		// Feature worktrees may reuse a dependency tree from the canonical clone.
		// Keep Vite strict by default and allow that resolved tree only when the
		// local runner opts in explicitly.
		fs: process.env.ATMO_DEV_FS_ALLOW
			? {
					allow: [searchForWorkspaceRoot(process.cwd()), process.env.ATMO_DEV_FS_ALLOW]
				}
			: undefined
	}
});
