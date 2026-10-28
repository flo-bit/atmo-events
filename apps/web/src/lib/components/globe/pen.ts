import { makeGeographicStroke } from './surface';

const RAD = Math.PI / 180;
const unit = (v: number[]) => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
};
const vector = ([lon, lat]: number[]) => [Math.cos(lon * RAD) * Math.cos(lat * RAD), Math.sin(lon * RAD) * Math.cos(lat * RAD), Math.sin(lat * RAD)];

export { sketchCoast } from './artwork.mjs';

/** Occasional small pen lifts, anchored to the coast rather than SVG dash lengths. */
export function makeCoastGestures(ring: number[][]): Float32Array[] {
  const stroke = makeGeographicStroke(ring);
  if (stroke.length < 70 * 3) return [stroke];
  const strokes: Float32Array[] = [];
  const seed = ring[0][0] * 0.7 + ring[0][1] * 0.3;
  let at = 0, part = 0;
  while (at < stroke.length) {
    const count = 27 + Math.round((Math.sin(seed + part * 3.7) + 1) * 9);
    const end = Math.min(stroke.length, at + count * 3);
    if (end - at > 3) strokes.push(stroke.slice(at, end));
    at = end;
    part++;
  }
  return strokes;
}

/** Broken corrective pen gestures, not a translated copy of every contour. */
export function makeCoastRetraces(polygons: number[][][][]): Float32Array[] {
  return polygons.flatMap((polygon, polygonIndex) => polygon.flatMap((ring) => {
    const strokes: Float32Array[] = [];
    for (let start = 5; start < ring.length - 5; start += 29) {
      if ((Math.floor(start / 29) + polygonIndex) % 3 === 1) continue;
      const line = ring.slice(start, start + 11).map(vector);
      const points = line.flatMap((p, i) => {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
        const tangent = b.map((v, axis) => v - a[axis]);
        const normal = unit([p[1] * tangent[2] - p[2] * tangent[1], p[2] * tangent[0] - p[0] * tangent[2], p[0] * tangent[1] - p[1] * tangent[0]]);
        const drift = (0.2 + Math.sin(i * 0.8 + polygonIndex) * 0.17) * RAD;
        return unit(p.map((v, axis) => v + normal[axis] * drift));
      });
      if (points.length > 3) strokes.push(new Float32Array(points));
    }
    return strokes;
  }));
}

/** Tapered, variable-width ink laid along selected stretches of the coast. */
export function makeCoastPressure(polygons: number[][][][]): Float32Array[] {
  return polygons.flatMap((polygon, polygonIndex) => polygon.flatMap((ring) => {
    const ribbons: Float32Array[] = [];
    for (let start = 0; start < ring.length - 3; start += 17) {
      if ((Math.floor(start / 17) + polygonIndex) % 2 !== 0) continue;
      const line = ring.slice(start, start + 13).map(vector);
      const left: number[][] = [], right: number[][] = [];
      const weight = 0.8 + (Math.sin(polygonIndex * 3.7 + start) + 1) * 0.2;
      for (let i = 0; i < line.length; i++) {
        const p = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
        const tangent = b.map((x, j) => x - a[j]);
        const normal = unit([
          p[1] * tangent[2] - p[2] * tangent[1],
          p[2] * tangent[0] - p[0] * tangent[2],
          p[0] * tangent[1] - p[1] * tangent[0],
        ]);
        const t = i / (line.length - 1);
        const width = (0.00025 + 0.0065 * Math.pow(Math.sin(Math.PI * t), 1.8)) * weight;
        left.push(unit(p.map((x, j) => x + normal[j] * width)));
        right.push(unit(p.map((x, j) => x - normal[j] * width)));
      }
      ribbons.push(new Float32Array([...left, ...right.reverse()].flat()));
    }
    return ribbons;
  }));
}

/** Static pressure strokes for the globe's outline. No extra per-frame work. */
export function rimPressure(radius: number, center: number) {
  return [[-0.65, -0.17], [1.16, 1.7], [2.65, 3.34], [4.05, 4.7]].map(([start, end]) => {
    const left: string[] = [], right: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = start + (end - start) * t;
      const r = radius + Math.sin(a * 5) * 0.9 + Math.cos(a * 9) * 0.5;
      const width = 0.15 + 1.2 * Math.pow(Math.sin(Math.PI * t), 1.5);
      left.push(`${(center + Math.cos(a) * (r + width)).toFixed(2)},${(center + Math.sin(a) * (r + width)).toFixed(2)}`);
      right.push(`${(center + Math.cos(a) * (r - width)).toFixed(2)},${(center + Math.sin(a) * (r - width)).toFixed(2)}`);
    }
    return `M${left.join('L')}L${right.reverse().join('L')}Z`;
  }).join('');
}
