// atmo end to end, on the local atproto network in snowglobe.yml: `pnpm test:e2e` from the repo
// root. e2e/setup.ts starts atmo's dev server with that network's settings; the tests drive a
// Chromium through real sign-ins at each person's own PDS.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['e2e/**/*.e2e.ts'],
		globalSetup: ['e2e/setup.ts'],
		// One file at a time: the tests share the network and one dev server.
		fileParallelism: false,
		testTimeout: 180_000,
		hookTimeout: 180_000
	}
});
