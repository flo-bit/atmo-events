import { afterEach, describe, expect, it, vi } from 'vitest';

const failInit = vi.hoisted(() => ({ once: true }));

vi.mock('@takumi-rs/wasm', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@takumi-rs/wasm')>();
	return {
		...actual,
		initSync: (...args: Parameters<typeof actual.initSync>) => {
			if (failInit.once) {
				failInit.once = false;
				throw new Error('initSync failed');
			}
			return actual.initSync(...args);
		}
	};
});

afterEach(() => vi.resetModules());

describe('WASM init', () => {
	it('retries after initSync throws instead of failing every later card', async () => {
		const { withOgRenderer } = await import('./takumi');
		const html = '<div class="flex h-full w-full bg-black"></div>';
		const size = { width: 40, height: 20 };
		await expect(withOgRenderer((r) => r.renderHtml(html, size))).rejects.toThrow(
			'initSync failed'
		);
		const png = await withOgRenderer((r) => r.renderHtml(html, size));
		expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
	});
});
