import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('country normalization loads in Vite dev SSR without CommonJS globals', async () => {
	// Vitest and production builds transform dependencies differently from the
	// dev module runner. Exercise the latter to catch `require is not defined`.
	const server = await createServer({
		server: { middlewareMode: true },
		appType: 'custom',
		optimizeDeps: { noDiscovery: true, include: [] }
	});
	try {
		const { normalizeCountryCode } = await server.ssrLoadModule(
			fileURLToPath(new URL('../../../packages/ui/src/editor/location.ts', import.meta.url))
		);
		for (const [input, expected] of [
			['United States', 'US'],
			['us', 'US'],
			['USA', 'US'],
			['UK', 'GB'],
			['Côte d’Ivoire', 'CI'],
			['Atlantis', undefined]
		]) {
			assert.equal(normalizeCountryCode(input), expected);
		}
	} finally {
		await server.close();
	}
});
