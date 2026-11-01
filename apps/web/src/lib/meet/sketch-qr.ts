interface QrMatrix {
	size: number;
	get(row: number, column: number): number;
}

export interface SketchQr {
	size: number;
	modules: string;
	finders: string[];
}

// Deterministic ink edges: never animate or randomly redraw a code while it is being scanned.
function noise(seed: number) {
	let n = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
	n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
	return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff - 0.5;
}
function number(value: number) {
	return Number(value.toFixed(3));
}

/** Slightly bowed edges and uneven round corners, with every cell centre kept solid. */
function inkBox(x: number, y: number, width: number, radius: number, seed: number, wobble: number) {
	const point = (px: number, py: number) => `${number(px)} ${number(py)}`;
	const left = x + noise(seed) * wobble;
	const top = y + noise(seed + 1) * wobble;
	const right = x + width + noise(seed + 2) * wobble;
	const bottom = y + width + noise(seed + 3) * wobble;
	return [
		`M${point(left + radius, top)}`,
		`Q${point(x + width / 2, top + noise(seed + 4) * wobble)} ${point(right - radius, top)}`,
		`Q${point(right, top)} ${point(right, top + radius)}`,
		`Q${point(right + noise(seed + 5) * wobble, y + width / 2)} ${point(right, bottom - radius)}`,
		`Q${point(right, bottom)} ${point(right - radius, bottom)}`,
		`Q${point(x + width / 2, bottom + noise(seed + 6) * wobble)} ${point(left + radius, bottom)}`,
		`Q${point(left, bottom)} ${point(left, bottom - radius)}`,
		`Q${point(left + noise(seed + 7) * wobble, y + width / 2)} ${point(left, top + radius)}`,
		`Q${point(left, top)} ${point(left + radius, top)}Z`
	].join('');
}

/** Keep the standard QR grid, finder topology and a generous five-module quiet zone. */
export function sketchQr(matrix: QrMatrix): SketchQr {
	const margin = 5;
	const n = matrix.size;
	const origins: [number, number][] = [
		[0, 0],
		[n - 7, 0],
		[0, n - 7]
	];
	const modules: string[] = [];
	for (let row = 0; row < n; row++) {
		for (let col = 0; col < n; col++) {
			if (
				!matrix.get(row, col) ||
				origins.some(([x, y]) => col >= x && col < x + 7 && row >= y && row < y + 7)
			)
				continue;
			const seed = row * n + col;
			modules.push(
				inkBox(
					col + margin + 0.015,
					row + margin + 0.015,
					0.97,
					0.11 + noise(seed + 8) * 0.09,
					seed,
					0.07
				)
			);
		}
	}
	const finders = origins.map(([col, row], i) => {
		const x = col + margin,
			y = row + margin,
			seed = 9000 + i * 37;
		// Even-odd filling preserves the white ring and solid 3×3 centre of each finder.
		return (
			inkBox(x + 0.025, y + 0.025, 6.95, 0.43, seed, 0.16) +
			inkBox(x + 1.025, y + 1.025, 4.95, 0.26, seed + 10, 0.1) +
			inkBox(x + 2.025, y + 2.025, 2.95, 0.25, seed + 20, 0.1)
		);
	});
	return { size: n + margin * 2, modules: modules.join(''), finders };
}
