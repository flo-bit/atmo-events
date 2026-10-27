const RAD = Math.PI / 180;
/** @param {number[]} v */
const unit = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
};
/** @param {number[]} a @param {number[]} b */
const distance = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, x, i) => sum + x * b[i], 0))));

/**
 * Redraw a closed coastline as a continuous freehand gesture. This changes the
 * source drawing, not the screen projection: spline smoothing, relaxed detail,
 * and uneven normal drift all remain attached to the geographic surface.
 * @param {number[][]} ring
 * @returns {number[][]}
 */
export function sketchCoast(ring) {
  if (ring.length < 4) return ring.map((point) => [...point]);
  const original = ring.slice(0, -1).map(([lon, lat]) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ]);
  /** @type {number[][]} */
  let nodes = [];
  for (const point of original) {
    if (!nodes.length || distance(nodes[nodes.length - 1], point) > 0.65 * RAD) nodes.push(point);
  }
  if (nodes.length < 4) nodes = original;
  if (nodes.length < 3) return ring.map((point) => [...point]);
  const lengths = nodes.map((p, i) => distance(p, nodes[(i + 1) % nodes.length]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 0.00001) return ring.map((point) => [...point]);
  const degrees = total / RAD;
  const strength = Math.min(1, degrees / 16);
  const seed = ring[0][0] * 0.37 + ring[0][1] * 0.61;
  const slow = Math.max(2, Math.round(degrees / 22));
  const medium = Math.max(3, Math.round(degrees / 7));
  const fast = Math.max(5, Math.round(degrees / 2.8));
  /** @type {number[][]} */
  const drawn = [];
  let travelled = 0;
  for (let i = 0; i < nodes.length; i++) {
    const p0 = nodes[(i + nodes.length - 1) % nodes.length];
    const p1 = nodes[i], p2 = nodes[(i + 1) % nodes.length], p3 = nodes[(i + 2) % nodes.length];
    const steps = Math.max(1, Math.ceil(lengths[i] / (1.05 * RAD)));
    for (let sample = 0; sample < steps; sample++) {
      const t = sample / steps;
      const a = p1.map((_, axis) => -p0[axis] + p2[axis]);
      const b = p1.map((_, axis) => 2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]);
      const c = p1.map((_, axis) => -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]);
      const point = unit(p1.map((v, axis) => 0.5 * (2 * v + a[axis] * t + b[axis] * t * t + c[axis] * t * t * t)));
      const tangent = a.map((v, axis) => v + 2 * b[axis] * t + 3 * c[axis] * t * t);
      const normal = unit([
        point[1] * tangent[2] - point[2] * tangent[1],
        point[2] * tangent[0] - point[0] * tangent[2],
        point[0] * tangent[1] - point[1] * tangent[0],
      ]);
      const phase = (travelled + lengths[i] * t) / total * Math.PI * 2;
      const drift = strength * RAD * (
        0.30 * Math.sin(phase * slow + seed)
        + 0.19 * Math.sin(phase * medium - seed * 0.7)
        + 0.075 * Math.sin(phase * fast + seed * 1.3)
      );
      const ink = unit(point.map((v, axis) => v + normal[axis] * drift));
      drawn.push([Math.atan2(ink[1], ink[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, ink[2]))) / RAD]);
    }
    travelled += lengths[i];
  }
  if (drawn.length) drawn.push([...drawn[0]]);
  return drawn;
}
