import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getWorkerUrl } from 'maplibre-gl';
import Map from '../src/Map.svelte';
import './theme.css';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('loads the emitted MapLibre worker instead of a dependency-cache URL', async () => {
	const NativeWorker = globalThis.Worker;
	const messages = vi.fn();
	const errors = vi.fn();
	vi.stubGlobal(
		'Worker',
		class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener('message', messages);
				this.addEventListener('error', errors);
			}
		}
	);

	// Keep the test independent of the map provider. Inline GeoJSON still needs
	// a working MapLibre worker to load and process the source.
	const originalFetch = globalThis.fetch;
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url === 'https://tiles.openfreemap.org/styles/liberty') {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						version: 8,
						sources: {
							test: {
								type: 'geojson',
								data: {
									type: 'Feature',
									properties: {},
									geometry: { type: 'Point', coordinates: [13.38107, 52.49833] }
								}
							}
						},
						layers: [{ id: 'point', type: 'circle', source: 'test' }]
					}),
					{ headers: { 'Content-Type': 'application/json' } }
				)
			);
		}
		return originalFetch(input, init);
	});

	const { container } = await render(Map, { lat: 52.49833, lng: 13.38107 });
	container.style.width = '700px';
	container.style.height = '400px';
	expect(getWorkerUrl()).toContain('maplibre-gl-worker');
	expect(getWorkerUrl()).not.toContain('/.vite/deps/');
	await expect.poll(() => messages.mock.calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
	expect(errors).not.toHaveBeenCalled();
}, 15_000);
