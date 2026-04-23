export type ThumbnailRenderer = (
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	name: string,
	dateStr: string,
	seed: number,
	accent: string
) => void;

function lch(accent: string, l: number | string, c: number | string = 'c', hShift = 0, a = 1) {
	const lStr = typeof l === 'number' ? l.toFixed(3) : l;
	const cStr = typeof c === 'number' ? c.toFixed(3) : c;
	const hStr = hShift === 0 ? 'h' : `calc(h + ${hShift})`;
	return `oklch(from ${accent} ${lStr} ${cStr} ${hStr} / ${a})`;
}

/** Monochrome film-grain overlay. Reads back pixels and perturbs each RGB
 *  channel by ±intensity/255 using a seeded LCG — deterministic, so picker
 *  previews and the uploaded PNG match. Call as the final step of a design. */
function addNoise(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	seed: number,
	intensity = 7
) {
	const img = ctx.getImageData(0, 0, w, h);
	const data = img.data;
	let s = seed | 0 || 1;
	for (let i = 0; i < data.length; i += 4) {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		const n = ((s >>> 16) & 0xff) / 255 - 0.5;
		const d = n * 2 * intensity;
		data[i] = Math.max(0, Math.min(255, data[i] + d));
		data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + d));
		data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + d));
	}
	ctx.putImageData(img, 0, 0);
}

function drawText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	fontSize: number,
	fontWeight: string,
	color: string,
	align: CanvasTextAlign = 'center'
) {
	ctx.fillStyle = color;
	ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = align;
	ctx.textBaseline = 'middle';

	const words = text.split(' ');
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else {
			line = test;
		}
	}
	if (line) lines.push(line);

	const lineHeight = fontSize * 1.2;
	const totalHeight = lines.length * lineHeight;
	const startY = y - totalHeight / 2 + lineHeight / 2;

	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], x, startY + i * lineHeight, maxWidth);
	}

	return totalHeight;
}

export const gradientMesh: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	const angle = (seed * 47) % 360;
	const rad = (angle * Math.PI) / 180;
	const cx = w / 2 + (Math.cos(rad) * w) / 2;
	const cy = h / 2 + (Math.sin(rad) * h) / 2;

	const shiftA = ((seed * 37) % 60) - 30;
	const shiftB = ((seed * 71) % 70) + 20;

	const bg = ctx.createLinearGradient(w - cx, h - cy, cx, cy);
	bg.addColorStop(0, lch(accent, 0.55, 'c', shiftA));
	bg.addColorStop(0.5, lch(accent, 0.45, 'c', 0));
	bg.addColorStop(1, lch(accent, 0.35, 'c', -shiftB));
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);

	function blob(x: number, y: number, r: number, hShift: number, alpha: number) {
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, lch(accent, 0.75, 'c', hShift, alpha));
		g.addColorStop(1, lch(accent, 0.75, 'c', hShift, 0));
		ctx.fillStyle = g;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}

	const p = (i: number, m: number) => ((seed * i) % m) / m;
	blob(w * (-0.1 + p(17, 30) * 0.3), h * (-0.1 + p(23, 30) * 0.3), w * 0.4, shiftA * 1.5, 0.45);
	blob(w * (1.1 - p(13, 30) * 0.3), h * (1.1 - p(19, 30) * 0.3), w * 0.35, shiftB, 0.35);
	blob(w * (0.3 + p(29, 40) * 0.4), h * (0.3 + p(31, 40) * 0.4), w * 0.3, -shiftA, 0.3);

	if (name) {
		const th = drawText(ctx, name, w / 2, h / 2 - 10, w * 0.75, w * 0.09, 'bold', 'white');
		if (dateStr) {
			drawText(
				ctx,
				dateStr,
				w / 2,
				h / 2 + th / 2 + w * 0.03,
				w * 0.7,
				w * 0.04,
				'500',
				'rgba(255,255,255,0.85)'
			);
		}
	}

	addNoise(ctx, w, h, seed);
};

export const boldType: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	ctx.fillStyle = lch(accent, 0.12, 0.025);
	ctx.fillRect(0, 0, w, h);

	const angle = (seed * 53) % 360;
	const rad = (angle * Math.PI) / 180;
	const hl = ctx.createLinearGradient(
		w / 2 - (Math.cos(rad) * w) / 2,
		h / 2 - (Math.sin(rad) * h) / 2,
		w / 2 + (Math.cos(rad) * w) / 2,
		h / 2 + (Math.sin(rad) * h) / 2
	);
	hl.addColorStop(0, lch(accent, 0.22, 'c', 0, 0.4));
	hl.addColorStop(1, lch(accent, 0.1, 0.02, 0, 0));
	ctx.fillStyle = hl;
	ctx.fillRect(0, 0, w, h);

	if (name) {
		drawText(
			ctx,
			name,
			w * 0.07,
			h * 0.72,
			w * 0.86,
			w * 0.11,
			'900',
			lch(accent, 0.75, 'c'),
			'left'
		);
	}
	if (dateStr) {
		ctx.fillStyle = lch(accent, 0.55, 0.03, 0, 0.9);
		ctx.font = `500 ${w * 0.04}px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(dateStr, w * 0.07, h * 0.88);
	}

	addNoise(ctx, w, h, seed);
};

export const minimal: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	ctx.fillStyle = lch(accent, 0.97, 0.02);
	ctx.fillRect(0, 0, w, h);

	const edge = seed % 4;
	ctx.fillStyle = lch(accent, 0.55, 'c');
	if (edge === 0) ctx.fillRect(0, h * 0.5 - 1.5, w * 0.12, 3);
	else if (edge === 1) ctx.fillRect(w * 0.88, h * 0.5 - 1.5, w * 0.12, 3);
	else if (edge === 2) ctx.fillRect(w * 0.44, 0, 3, h * 0.12);
	else ctx.fillRect(w * 0.44, h * 0.88, 3, h * 0.12);

	if (name) {
		const th = drawText(
			ctx,
			name,
			w / 2,
			h / 2 - 10,
			w * 0.75,
			w * 0.09,
			'600',
			lch(accent, 0.25, 'c')
		);
		if (dateStr) {
			drawText(
				ctx,
				dateStr,
				w / 2,
				h / 2 + th / 2 + w * 0.03,
				w * 0.7,
				w * 0.04,
				'normal',
				lch(accent, 0.5, 'c')
			);
		}
	}

	addNoise(ctx, w, h, seed);
};

export const geometric: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	ctx.fillStyle = lch(accent, 0.55, 'c');
	ctx.fillRect(0, 0, w, h);

	ctx.globalAlpha = 0.18;
	for (let i = 0; i < 6; i++) {
		const x = (((seed * 31 + i * 73) % 100) / 100) * w;
		const y = (((seed * 47 + i * 59) % 100) / 100) * h;
		const size = ((15 + ((seed * 13 + i * 41) % 25)) / 100) * w;
		const type = i % 3;
		const hShift = (((seed * 19 + i * 53) % 90) - 45) * 0.6;

		ctx.fillStyle = lch(accent, 0.85, 'c', hShift);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate((((seed * 23 + i * 67) % 360) * Math.PI) / 180);

		if (type === 0) {
			ctx.beginPath();
			ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
			ctx.fill();
		} else if (type === 1) {
			ctx.fillRect(-size / 2, -size / 2, size, size);
		} else {
			ctx.beginPath();
			ctx.moveTo(0, -size / 2);
			ctx.lineTo(-size / 2, size / 2);
			ctx.lineTo(size / 2, size / 2);
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}
	ctx.globalAlpha = 1;

	if (name) {
		const th = drawText(ctx, name, w / 2, h / 2 - 10, w * 0.75, w * 0.09, 'bold', 'white');
		if (dateStr) {
			drawText(
				ctx,
				dateStr,
				w / 2,
				h / 2 + th / 2 + w * 0.03,
				w * 0.7,
				w * 0.04,
				'500',
				'rgba(255,255,255,0.8)'
			);
		}
	}

	addNoise(ctx, w, h, seed);
};

export const darkGradient: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	const angle = (seed * 67) % 360;
	const rad = (angle * Math.PI) / 180;
	const bg = ctx.createLinearGradient(
		w / 2 - (Math.cos(rad) * w) / 2,
		h / 2 - (Math.sin(rad) * h) / 2,
		w / 2 + (Math.cos(rad) * w) / 2,
		h / 2 + (Math.sin(rad) * h) / 2
	);
	bg.addColorStop(0, lch(accent, 0.18, 'c'));
	bg.addColorStop(1, lch(accent, 0.06, 0.03));
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);

	const edge = seed % 4;
	const shift = ((seed * 43) % 120) - 60;
	const line = ctx.createLinearGradient(0, 0, w, 0);
	line.addColorStop(0, lch(accent, 0.65, 'c', shift));
	line.addColorStop(1, lch(accent, 0.7, 'c', -shift));
	ctx.fillStyle = line;
	if (edge === 0) ctx.fillRect(0, 0, w, h * 0.012);
	else if (edge === 1) ctx.fillRect(0, h * 0.988, w, h * 0.012);
	else if (edge === 2) ctx.fillRect(0, 0, w * 0.012, h);
	else ctx.fillRect(w * 0.988, 0, w * 0.012, h);

	if (name) {
		drawText(ctx, name, w * 0.07, h * 0.72, w * 0.86, w * 0.09, 'bold', 'white', 'left');
	}
	if (dateStr) {
		ctx.fillStyle = lch(accent, 0.65, 'c');
		ctx.font = `normal ${w * 0.04}px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(dateStr, w * 0.07, h * 0.88);
	}

	addNoise(ctx, w, h, seed);
};

export const waves: ThumbnailRenderer = (ctx, w, h, name, dateStr, seed, accent) => {
	ctx.fillStyle = lch(accent, 0.95, 0.04);
	ctx.fillRect(0, 0, w, h);

	function wave(
		yBase: number,
		amplitude: number,
		frequency: number,
		phase: number,
		color: string,
		alpha: number
	) {
		ctx.globalAlpha = alpha;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(0, yBase);
		for (let x = 0; x <= w; x += 2) {
			const y = yBase + Math.sin((x / w) * Math.PI * frequency + phase) * amplitude;
			ctx.lineTo(x, y);
		}
		ctx.lineTo(w, h);
		ctx.lineTo(0, h);
		ctx.closePath();
		ctx.fill();
	}

	const freq = 2 + (seed % 3);
	const phase = seed;

	wave(h * 0.7, h * 0.05, freq, phase, lch(accent, 0.78, 'c', 20), 0.55);
	wave(h * 0.78, h * 0.04, freq + 1, phase + 1, lch(accent, 0.65, 'c', 0), 0.5);
	wave(h * 0.85, h * 0.03, freq + 2, phase + 2, lch(accent, 0.5, 'c', -20), 0.55);
	ctx.globalAlpha = 1;

	if (name) {
		const th = drawText(
			ctx,
			name,
			w / 2,
			h * 0.4,
			w * 0.75,
			w * 0.09,
			'bold',
			lch(accent, 0.25, 'c')
		);
		if (dateStr) {
			drawText(
				ctx,
				dateStr,
				w / 2,
				h * 0.4 + th / 2 + w * 0.03,
				w * 0.7,
				w * 0.04,
				'500',
				lch(accent, 0.45, 'c')
			);
		}
	}

	addNoise(ctx, w, h, seed);
};

/** Textless gradient-mesh preset — built from 6 overlapping radial hotspots
 *  placed around a loose 3×2 grid with seeded jitter. Used as the default
 *  thumbnail for new events. */
export const plainMesh: ThumbnailRenderer = (ctx, w, h, _name, _dateStr, seed, accent) => {
	const p = (i: number, m: number) => ((seed * i) % m) / m;
	const jitter = (i: number, amt: number) => (p(i, 100) - 0.5) * amt;

	// Mid-tone accent base so the hotspots read as both lighter and darker pools
	ctx.fillStyle = lch(accent, 0.5, 'c');
	ctx.fillRect(0, 0, w, h);

	// Six hotspots anchored to a 3x2 grid, each jittered and hue-shifted
	// independently so no two thumbnails look the same.
	const anchors = [
		{ x: 0.18, y: 0.22 },
		{ x: 0.55, y: 0.15 },
		{ x: 0.85, y: 0.35 },
		{ x: 0.2, y: 0.72 },
		{ x: 0.55, y: 0.85 },
		{ x: 0.88, y: 0.78 }
	];
	// Alternating light/dark levels and hue shifts spread across the spectrum
	const levels = [0.8, 0.62, 0.78, 0.38, 0.72, 0.48];
	const shifts = [-55, 25, 55, -25, 40, -40];

	for (let i = 0; i < anchors.length; i++) {
		const a = anchors[i];
		const x = (a.x + jitter(11 + i * 7, 0.18)) * w;
		const y = (a.y + jitter(17 + i * 11, 0.18)) * h;
		const r = w * (0.45 + p(23 + i * 5, 40) * 0.25);
		const hShift = shifts[i] + jitter(29 + i * 13, 20);
		const l = levels[i] + jitter(31 + i * 3, 0.08);
		const alpha = 0.55 + p(37 + i * 3, 20) * 0.1;

		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, lch(accent, l, 'c', hShift, alpha));
		g.addColorStop(1, lch(accent, l, 'c', hShift, 0));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
	}

	addNoise(ctx, w, h, seed);
};

export const DEFAULT_PRESET = 'plain';

export const designs: Record<string, ThumbnailRenderer> = {
	plain: plainMesh,
	gradient: gradientMesh,
	bold: boldType,
	minimal,
	geometric,
	dark: darkGradient,
	waves
};

/** Concrete oklch() values for each Tailwind accent-500, so canvas rendering
 *  stays in sync with the theme without depending on CSS-var resolution timing
 *  (also works during SSR and before the theme class is applied). */
const ACCENT_OKLCH: Record<string, string> = {
	red: 'oklch(0.637 0.237 25.331)',
	orange: 'oklch(0.705 0.213 47.604)',
	amber: 'oklch(0.769 0.188 70.08)',
	yellow: 'oklch(0.795 0.184 86.047)',
	lime: 'oklch(0.768 0.233 130.85)',
	green: 'oklch(0.723 0.219 149.579)',
	emerald: 'oklch(0.696 0.17 162.48)',
	teal: 'oklch(0.704 0.14 182.503)',
	cyan: 'oklch(0.715 0.143 215.221)',
	sky: 'oklch(0.685 0.169 237.323)',
	blue: 'oklch(0.623 0.214 259.815)',
	indigo: 'oklch(0.585 0.233 277.117)',
	violet: 'oklch(0.606 0.25 292.717)',
	purple: 'oklch(0.627 0.265 303.9)',
	fuchsia: 'oklch(0.667 0.295 322.15)',
	pink: 'oklch(0.656 0.241 354.308)',
	rose: 'oklch(0.645 0.246 16.439)'
};

export function resolveAccentColor(name?: string): string {
	return (name && ACCENT_OKLCH[name]) || ACCENT_OKLCH.cyan;
}

/** Stable non-zero integer seed derived from a string (e.g. an event rkey).
 *  Same input always produces the same seed, so the picker preview matches
 *  the uploaded PNG for a given event. */
export function hashSeed(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h) || 1;
}
