import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CalendarDays } from '@sketchyicons/svelte/icons/calendar-days';
import sharp from 'sharp';
import { generateFavicons } from './generate-favicons.mjs';

let output;
before(async () => {
	const directory = await mkdtemp(join(tmpdir(), 'atmo-favicons-'));
	output = pathToFileURL(`${directory}/`);
	await generateFavicons(output);
});
after(async () => {
	if (output) await rm(output, { recursive: true, force: true });
});
const read = (name) => readFile(new URL(name, output));

test('generated assets are deterministic and committed copies are current', async () => {
	for (const name of await readdir(output)) {
		assert.deepEqual(
			await read(name),
			await readFile(new URL(`../static/${name}`, import.meta.url))
		);
	}
});

test('SVG uses the exact logo geometry and accent color', async () => {
	const source = (await read('favicon.svg')).toString();
	for (const [, attributes] of CalendarDays) assert.ok(source.includes(attributes.d));
	assert.ok(source.includes('fill="#e60076"'));
	assert.ok(source.includes('stroke="#ffffff"'));
});

test('PNG sizes and opaque home-screen backgrounds are correct', async () => {
	for (const [name, size] of [
		['favicon-32x32.png', 32],
		['apple-touch-icon.png', 180],
		['icon-192.png', 192],
		['icon-512.png', 512],
		['icon-maskable-512.png', 512]
	]) {
		const image = sharp(await read(name));
		const metadata = await image.metadata();
		assert.equal(metadata.width, size);
		assert.equal(metadata.height, size);
		if (name !== 'favicon-32x32.png') {
			assert.equal((await image.stats()).isOpaque, true);
			const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
			assert.deepEqual([...data.subarray(0, 4)], [230, 0, 118, 255]);
		}
	}
});

test('ICO directory points to valid 16, 32 and 48 pixel PNG frames', async () => {
	const source = await read('favicon.ico');
	assert.equal(source.readUInt16LE(0), 0);
	assert.equal(source.readUInt16LE(2), 1);
	assert.equal(source.readUInt16LE(4), 3);
	for (const [index, size] of [16, 32, 48].entries()) {
		const entry = 6 + index * 16;
		assert.equal(source[entry], size);
		assert.equal(source[entry + 1], size);
		const length = source.readUInt32LE(entry + 8);
		const offset = source.readUInt32LE(entry + 12);
		const metadata = await sharp(source.subarray(offset, offset + length)).metadata();
		assert.equal(metadata.format, 'png');
		assert.equal(metadata.width, size);
		assert.equal(metadata.height, size);
	}
});

test('manifest references generated icons with matching dimensions', async () => {
	const manifest = JSON.parse(await read('site.webmanifest'));
	assert.equal(manifest.name, 'atmo.rsvp');
	assert.equal(manifest.theme_color, '#e60076');
	for (const icon of manifest.icons) {
		const metadata = await sharp(await read(icon.src.slice(1))).metadata();
		assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
	}
	assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
	const html = await readFile(new URL('../src/app.html', import.meta.url), 'utf8');
	assert.ok(html.includes(`<meta name="theme-color" content="${manifest.theme_color}"`));
});

test('maskable icon keeps its entire drawing inside the central 80% safe circle', async () => {
	const { data, info } = await sharp(await read('icon-maskable-512.png'))
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			// The background has no green channel; any green identifies the white drawing.
			if (data[(y * info.width + x) * 4 + 1] > 0) {
				assert.ok(Math.hypot(x + 0.5 - 256, y + 0.5 - 256) <= 512 * 0.4);
			}
		}
	}
});
