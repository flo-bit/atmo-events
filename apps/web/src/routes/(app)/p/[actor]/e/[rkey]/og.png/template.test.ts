import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { IMAGE_PLACEHOLDERS, parseOgHtml } from '#lib/server/og/takumi.js';
import EventOgImage from './EventOgImage.svelte';

type TakumiNode = { type: string; text?: string; tw?: string; children?: TakumiNode[] };

async function parse(name: string) {
	const { body } = render(EventOgImage, {
		props: {
			name,
			dateStr: 'Saturday, August 1',
			cardImage: IMAGE_PLACEHOLDERS.card,
			backgroundImage: IMAGE_PLACEHOLDERS.background,
			blurBackground: true
		}
	});
	return (await parseOgHtml(body)).node as TakumiNode;
}

const shape = (node: TakumiNode): unknown => [node.type, (node.children ?? []).map(shape)];
const texts = (node: TakumiNode): string[] => [
	...(node.text !== undefined ? [node.text] : []),
	...(node.children ?? []).flatMap(texts)
];

describe('EventOgImage markup', () => {
	it.each([
		'<img src="https://evil.test/x"> & <b>bold</b> "quotes"',
		'x"><img src=https://evil.test/x><div tw="absolute inset-0 bg-red-500">',
		"it's <script>alert(1)</script> &amp; &lt;b&gt;",
		'Workshop class="intro" for <div class="x">'
	])('keeps an event name as one text node: %s', async (name) => {
		const hostile = await parse(name);
		expect(shape(hostile)).toEqual(shape(await parse('Plain event name')));
		expect(texts(hostile)).toContain(name);
	});

	it('passes template classes to Takumi as tw', async () => {
		const find = (node: TakumiNode): TakumiNode | undefined =>
			node.text === 'Plain event name' ? node : (node.children ?? []).map(find).find(Boolean);
		expect(find(await parse('Plain event name'))?.tw).toContain('text-5xl');
	});
});
