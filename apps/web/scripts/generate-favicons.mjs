import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CalendarDays } from '@sketchyicons/svelte/icons/calendar-days';
import sharp from 'sharp';

// Same icon as the header logo; Tailwind's pink-600 against white stays legible at small sizes.
const background = '#e60076';
const foreground = '#ffffff';
const defaultOutput = new URL('../static/', import.meta.url);

function escapeAttribute(value) {
	return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function svg({ rounded = false, maskable = false } = {}) {
	const size = maskable ? 36 : 44;
	const inset = (64 - size) / 2;
	const paths = CalendarDays.map(
		([tag, attributes]) =>
			`<${tag} ${Object.entries(attributes)
				.map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
				.join(' ')} />`
	).join('\n\t\t');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
	<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${background}" />
	<svg x="${inset}" y="${inset}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${foreground}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		${paths}
	</svg>
</svg>
`;
}

// ICO directory with PNG frames: one file serves legacy URLs at native tab sizes.
function ico(frames) {
	const header = Buffer.alloc(6 + frames.length * 16);
	header.writeUInt16LE(1, 2); // Image type: icon.
	header.writeUInt16LE(frames.length, 4);
	let offset = header.length;
	frames.forEach(({ size, png }, index) => {
		const entry = 6 + index * 16;
		header[entry] = size;
		header[entry + 1] = size;
		header.writeUInt16LE(1, entry + 4); // Color planes.
		header.writeUInt16LE(32, entry + 6); // Bits per pixel.
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
	});
	return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

export async function generateFavicons(output = defaultOutput) {
	await mkdir(output, { recursive: true });
	const destination = (name) => new URL(name, output);
	const favicon = svg({ rounded: true });
	const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer();
	const frames = await Promise.all(
		[16, 32, 48].map(async (size) => ({ size, png: await png(favicon, size) }))
	);
	const manifest = {
		name: 'atmo.rsvp',
		start_url: '/',
		display: 'standalone',
		theme_color: background,
		background_color: '#fafafa',
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]
	};
	await Promise.all([
		writeFile(destination('favicon.svg'), favicon),
		writeFile(destination('favicon.ico'), ico(frames)),
		writeFile(destination('favicon-32x32.png'), frames[1].png),
		writeFile(destination('site.webmanifest'), `${JSON.stringify(manifest, null, '\t')}\n`),
		...[
			['apple-touch-icon.png', 180, svg()],
			['icon-192.png', 192, svg()],
			['icon-512.png', 512, svg()],
			['icon-maskable-512.png', 512, svg({ maskable: true })]
		].map(async ([name, size, source]) => writeFile(destination(name), await png(source, size)))
	]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await generateFavicons();
	console.log('Generated favicon, Apple touch and web-app icons in apps/web/static/.');
}
