import { describe, expect, it } from 'vitest';
import type { VNode } from '@ethercorps/sveltekit-og';
import { buildOgTree, IMAGE_PLACEHOLDERS } from './markup';

function find(node: VNode | string | undefined, type: string, out: VNode[] = []): VNode[] {
	if (!node || typeof node === 'string') return out;
	if (node.type === type) out.push(node);
	const { children } = node.props;
	for (const child of Array.isArray(children) ? children : [children]) find(child, type, out);
	return out;
}

describe('buildOgTree', () => {
	it('substitutes image placeholders after parsing and decodes Svelte entities', () => {
		const tree = buildOgTree(
			`<div><img src="${IMAGE_PLACEHOLDERS.background}" /><h1>Tom &amp; Jerry&#39;s &lt;party&gt;</h1>\n` +
				`<img src="${IMAGE_PLACEHOLDERS.thumbnail}" /><img src="https://example.test/keep.png" /></div>`,
			{
				[IMAGE_PLACEHOLDERS.background]: 'data:image/jpeg;base64,BG',
				[IMAGE_PLACEHOLDERS.thumbnail]: 'data:image/jpeg;base64,FG'
			}
		);
		expect(find(tree, 'img').map((img) => img.props.src)).toEqual([
			'data:image/jpeg;base64,BG',
			'data:image/jpeg;base64,FG',
			'https://example.test/keep.png'
		]);
		expect(find(tree, 'h1')[0].props.children).toBe("Tom & Jerry's <party>");
	});

	it('never turns escaped user text into markup', () => {
		// What Svelte SSR emits for an event named `<img src="https://evil.test/x">`.
		const tree = buildOgTree(
			'<div><h1>&lt;img src=&quot;https://evil.test/x&quot;&gt;</h1></div>',
			{}
		);
		expect(find(tree, 'img')).toEqual([]);
		expect(find(tree, 'h1')[0].props.children).toBe('<img src="https://evil.test/x">');
		// Double-escaped input decodes exactly one level.
		const literal = buildOgTree('<div><h1>&amp;lt;b&amp;gt;</h1></div>', {});
		expect(find(literal, 'h1')[0].props.children).toBe('&lt;b&gt;');
	});

	it('keeps large data URIs out of the HTML parser', () => {
		// Inline, this size took ~35 s of CPU in satori-html (superlinear parse).
		const huge = `data:image/jpeg;base64,${'A'.repeat(400_000)}`;
		const started = performance.now();
		const tree = buildOgTree(`<div><img src="${IMAGE_PLACEHOLDERS.thumbnail}" /></div>`, {
			[IMAGE_PLACEHOLDERS.thumbnail]: huge
		});
		expect(performance.now() - started).toBeLessThan(250);
		expect(find(tree, 'img')[0].props.src).toBe(huge);
	});
});
