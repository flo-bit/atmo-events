import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CalendarDays } from '@sketchyicons/svelte/icons/calendar-days';
import { chromium } from 'playwright';
import { CENTER, RADIUS, makeCamera, penCircle } from '../src/lib/components/globe/geometry';
import { decodeLayers } from '../src/lib/components/globe/layers';
import { rimPressure } from '../src/lib/components/globe/pen';
import {
	traceSurfaceRibbons,
	traceSurfaceStrokes,
	type PathSink
} from '../src/lib/components/globe/surface';

// Reuse the homepage's baked pen work, camera and font. No app server or live data needed.
const layers = decodeLayers(
	await readFile(new URL('../src/lib/components/globe/data/globe.bin', import.meta.url))
);
const camera = makeCamera(-25);
const kitRequire = createRequire(import.meta.resolve('@atmo-dev/kit'));
const font = await readFile(
	kitRequire.resolve('@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')
);

function path(trace: (sink: PathSink) => void) {
	let d = '';
	const point = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
	trace({
		moveTo: (x, y) => (d += `M${point(x, y)}`),
		lineTo: (x, y) => (d += `L${point(x, y)}`),
		closePath: () => (d += 'Z')
	});
	return d;
}

// Match drawGlobe's layer order, weights and dark-theme opacity.
function stroke(strokes: Float32Array[], width: number, opacity: number) {
	return `<path d="${path((sink) => traceSurfaceStrokes(sink, strokes, camera))}" stroke-width="${width}" opacity="${opacity}" />`;
}
const globe = `<svg viewBox="0 0 640 640" fill="none" stroke="#fafafa" stroke-linecap="round" stroke-linejoin="round">
	${stroke(layers.fill, 1.2, 0.58)}
	${stroke(layers.grid, 0.65, 0.14)}
	${stroke(layers.coast0, 1.1, 0.98)}
	${stroke(layers.coast1, 1.4, 0.98)}
	${stroke(layers.coast2, 1, 0.98)}
	<path d="${path((sink) => traceSurfaceRibbons(sink, layers.pressure, camera))}" fill="#fafafa" stroke="none" opacity="0.9" />
	${stroke(layers.retrace, 0.85, 0.65)}
	<path d="${penCircle(260.6, 1.8)}" stroke-width="0.95" opacity="0.6" />
	<path d="${penCircle(257.5, 0.7)}" stroke-width="0.85" opacity="0.6" stroke-dasharray="110 70 230 100 55 280" />
	<path d="${penCircle()}" stroke-width="1.65" opacity="0.96" />
	<path d="${rimPressure(RADIUS, CENTER)}" fill="#fafafa" stroke="none" opacity="0.85" />
</svg>`;
const icon = CalendarDays.map(
	([tag, attributes]) =>
		`<${tag} ${Object.entries(attributes)
			.map(
				([name, value]) =>
					`${name}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
			)
			.join(' ')} />`
).join('');

const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
});
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		deviceScaleFactor: 1
	});
	await page.setContent(`<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>atmo.rsvp</title>
<style>
	@font-face {
		font-family: Figtree;
		src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');
		font-weight: 300 900;
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: #111113; color: #fafafa; font-family: Figtree, sans-serif; }
	.logo { position: absolute; left: 76px; top: 100px; display: flex; align-items: center; gap: 13px; }
	.logo svg { width: 44px; height: 44px; color: #fda5d5; }
	.wordmark { font-size: 42px; font-weight: 600; letter-spacing: -1.05px; line-height: 1; }
	.wordmark span { color: #a1a1aa; }
	h1 { position: absolute; left: 76px; top: 255px; margin: 0; font-size: 70px; line-height: 1.06; font-weight: 600; letter-spacing: -1.75px; }
	.globe { position: absolute; left: 614px; top: 15px; width: 600px; height: 600px; }
</style>
<div class="logo">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
	<div class="wordmark">atmo<span>.rsvp</span></div>
</div>
<h1>Events for the<br />open social web.</h1>
<div class="globe">${globe}</div>
</html>`);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: new URL('../static/og.png', import.meta.url).pathname });
	console.log('Generated apps/web/static/og.png (1200 × 630).');
} finally {
	await browser.close();
}
