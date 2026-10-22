import { initSync, Renderer } from '@takumi-rs/wasm';
import { fromHtml } from '@takumi-rs/helpers/html';
import { extractEmojis } from '@takumi-rs/helpers/emoji';
import { ogFonts } from './fonts';
import { ImageFetchError, loadThumbnail } from './thumbnail';

// Noto Sans has no emoji; extractEmojis swaps them for Twemoji image nodes.
// Takumi never fetches image URLs itself, so we load them here, bounded.
const EMOJI_ORIGIN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@';
const MAX_EMOJI = 16;
const MAX_EMOJI_BYTES = 64 * 1024;

type TakumiNode = { type: string; src?: unknown; children?: (TakumiNode | null)[] };

function emojiSources(node: TakumiNode, found = new Set<string>()) {
	if (node.type === 'image' && typeof node.src === 'string' && node.src.startsWith(EMOJI_ORIGIN))
		found.add(node.src);
	for (const child of node.children ?? []) if (child) emojiSources(child, found);
	return found;
}

/**
 * An emoji Twemoji doesn't have (404) renders as blank space. Any other failure
 * fails the card, so a transient outage serves the static fallback and a later
 * request retries, instead of storing a card with a missing emoji for 90 days.
 */
async function loadEmoji(node: TakumiNode) {
	const sources = [...emojiSources(node)].slice(0, MAX_EMOJI);
	const loaded = await Promise.all(
		sources.map((src) =>
			loadThumbnail(src, { types: ['image/svg+xml'], maxBytes: MAX_EMOJI_BYTES }).then(
				(data) => ({ src, data }),
				(cause) => {
					if (cause instanceof ImageFetchError && cause.status === 404) return null;
					throw cause;
				}
			)
		)
	);
	return loaded.filter((image) => image !== null);
}

/** Short `src` keys; image bytes are passed separately, never inlined as base64. */
export const IMAGE_PLACEHOLDERS = {
	card: 'og-image:card',
	background: 'og-image:background',
	avatar: 'og-image:avatar'
} as const;

let ready: Promise<void> | undefined;

function ensureWasm() {
	// Reset on any failure (loading or initSync) so the next card retries.
	ready ??= loadWasm()
		.then((module) => void initSync({ module }))
		.catch((cause) => {
			ready = undefined;
			throw cause;
		});
	return ready;
}

async function loadWasm(): Promise<WebAssembly.Module | BufferSource> {
	if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
		return (await import('./takumi-wasm.workerd')).default;
	}
	// Node (vite dev, vitest): read the binary from the package.
	const { readFile } = await import('node:fs/promises');
	const { createRequire } = await import('node:module');
	return readFile(createRequire(import.meta.url).resolve('@takumi-rs/wasm/takumi_wasm_bg.wasm'));
}

type ParsedNode = { className?: string; tw?: string; children?: (ParsedNode | null)[] };

/** Takumi only applies Tailwind from `tw`; its parser keeps `class` as `className`. */
function classToTw(node: ParsedNode) {
	if (node.className && !node.tw) node.tw = node.className;
	for (const child of node.children ?? []) if (child) classToTw(child);
}

/**
 * Svelte-SSR markup to a Takumi node tree. Classes are mapped to `tw` on the
 * parsed tree, never in the markup string: Svelte doesn't escape `"` in text, so
 * a string rewrite would also change event titles. Keep user text out of
 * attributes too (see EventOgImage.svelte).
 */
export async function parseOgHtml(markup: string) {
	const parsed = await fromHtml(
		`<div style="display:flex;width:100%;height:100%;font-family:Inter">${markup}</div>`
	);
	classToTw(parsed.node as ParsedNode);
	return parsed;
}

export interface OgRenderer {
	/**
	 * Render Svelte-SSR markup to PNG. Tailwind classes are applied via Takumi's
	 * `tw` attribute, and `images` maps `src` values to raw image bytes.
	 */
	renderHtml(
		markup: string,
		size: { width: number; height: number },
		images?: Record<string, Uint8Array>
	): Promise<Uint8Array>;
}

/**
 * Run `fn` with a renderer that is freed afterwards. A renderer shared across
 * cards keeps every distinct SVG it has rasterized, growing memory toward the
 * Worker's 128 MB limit; a fresh one per card stays flat. (The exported
 * `Renderer` ignores constructor options, so its cache can't be disabled.)
 */
export async function withOgRenderer<T>(fn: (renderer: OgRenderer) => Promise<T>): Promise<T> {
	await ensureWasm();
	const takumi = new Renderer();
	try {
		for (const font of ogFonts()) await takumi.registerFont(font);
		return await fn({
			async renderHtml(markup, { width, height }, images = {}) {
				const parsed = await parseOgHtml(markup);
				const node = extractEmojis(parsed.node, 'twemoji');
				const emoji = await loadEmoji(node as TakumiNode);
				return takumi.render(node, {
					width,
					height,
					format: 'png',
					css: parsed.css,
					images: [...Object.entries(images).map(([src, data]) => ({ src, data })), ...emoji].map(
						(image) => ({ ...image, cache: 'none' as const })
					)
				});
			}
		});
	} finally {
		takumi.free();
	}
}
