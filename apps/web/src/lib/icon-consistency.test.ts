import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function components(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? components(path) : entry.name.endsWith('.svelte') ? [path] : [];
	});
}

const roots = [
	['app', fileURLToPath(new URL('../', import.meta.url))],
	['events-ui', fileURLToPath(new URL('../../../../packages/ui/src/', import.meta.url))],
	['kit', fileURLToPath(new URL('../../../../../00-atmo-kit/kit/src/lib/', import.meta.url))]
] as const;

// These SVGs are artwork, not interface icons. Brands also retain their original marks.
const artwork = new Set([
	'app/lib/components/globe/Globe.svelte',
	...['Bauhaus', 'Beam', 'Marble', 'Pixel', 'Ring', 'Sunset'].map(
		(name) =>
			`app/routes/(app)/p/[actor]/e/[rkey]/og.png/avatars/lib/components/Avatar${name}.svelte`
	)
]);

describe('hand-drawn interface icons', () => {
	it('uses the shared icon system instead of inline stock SVGs or text-symbol icons', () => {
		const violations: string[] = [];
		for (const [name, root] of roots) {
			for (const file of components(root)) {
				const source = readFileSync(file, 'utf8');
				const path = `${name}/${relative(root, file)}`;
				const markup = source
					.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '')
					.replace(/<!--[\s\S]*?-->/g, '');
				if (!artwork.has(path) && /<svg\b/.test(markup)) violations.push(`${path}: inline SVG`);
				if (/[↗←→]/.test(markup)) violations.push(`${path}: text-symbol icon`);
				if (/from\s+['"](?:lucide|@lucide|@heroicons|@iconify)/.test(source)) {
					violations.push(`${path}: stock icon import`);
				}
			}
		}
		expect(violations).toEqual([]);
	});
});
