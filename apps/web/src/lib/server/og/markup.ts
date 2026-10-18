import { parseHtml, type VNode } from '@ethercorps/sveltekit-og';

/** Short `src` stand-ins rendered by the template instead of data URIs. */
export const IMAGE_PLACEHOLDERS = {
	thumbnail: 'og-image:thumbnail',
	background: 'og-image:background'
} as const;

/**
 * Parse template markup into a satori tree, then substitute image placeholders.
 *
 * satori-html's parser is superlinear in markup length: a ~340 KB base64
 * thumbnail took ~35 s of CPU to parse, past the Worker CPU limit. Parsing
 * markup that only contains short placeholders and inserting the data URIs
 * into the parsed tree takes milliseconds, whatever the image size.
 */
export function buildOgTree(markup: string, images: Record<string, string>): VNode {
	const tree = parseHtml(markup.replaceAll('\n', '').trim());
	const visit = (node: VNode) => {
		for (const [key, value] of Object.entries(node.props)) {
			if (key === 'children') continue;
			if (typeof value === 'string') node.props[key] = decodeEntities(value);
			else if (key === 'style' && value && typeof value === 'object') {
				for (const [prop, css] of Object.entries(value))
					if (typeof css === 'string') value[prop] = decodeEntities(css);
			}
		}
		const { src } = node.props;
		if (typeof src === 'string' && Object.hasOwn(images, src)) node.props.src = images[src];
		const { children } = node.props;
		if (typeof children === 'string') node.props.children = decodeEntities(children);
		else if (Array.isArray(children)) {
			// satori-html emits mixed (and sparse) text/node arrays despite the VNode type.
			const items = children as Array<VNode | string | undefined>;
			items.forEach((child, i) => {
				if (typeof child === 'string') items[i] = decodeEntities(child);
				else if (child) visit(child);
			});
		} else if (children) visit(children);
	};
	visit(tree);
	return tree;
}

/**
 * Svelte SSR escapes these; satori-html leaves them as-is. Decode only AFTER
 * parsing, so user text such as an event name can never become markup.
 */
function decodeEntities(value: string) {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}
