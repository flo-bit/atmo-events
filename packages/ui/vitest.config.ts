import { defineConfig } from 'vitest/config';

// The editor mappers under test are plain TypeScript (no Svelte component
// mounting), so a minimal node-environment vitest config is all that's needed
// — no svelte plugin, no jsdom. Component testing infra can be layered on later
// if we start testing .svelte files directly.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
