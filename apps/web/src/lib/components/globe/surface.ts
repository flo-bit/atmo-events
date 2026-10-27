import scribbles from './data/scribbles.json';

/** Stable pen strokes on a unit sphere, rather than a screen-space SVG pattern. */
export interface SurfaceCamera {
  longitude: number;
  tilt: number;
  roll: number;
  radius: number;
  center: number;
}

const RAD = Math.PI / 180;

/** Land-only strokes are baked offline; convert their compact coordinates once. */
export function makeSurfaceStrokes(): Float32Array[] {
  return scribbles.map((stroke) => {
    const vectors = new Float32Array(stroke.length / 2 * 3);
    let longitude = 0, latitude = 0;
    for (let i = 0; i < stroke.length; i += 2) {
      longitude += stroke[i];
      latitude += stroke[i + 1];
      const lon = longitude / 100 * RAD, lat = latitude / 100 * RAD;
      const at = i / 2 * 3;
      vectors[at] = Math.cos(lat) * Math.cos(lon);
      vectors[at + 1] = Math.cos(lat) * Math.sin(lon);
      vectors[at + 2] = Math.sin(lat);
    }
    return vectors;
  });
}

/** Cache a coastline as xyz too. Densify long edges once, not on every redraw. */
export function makeGeographicStroke(coordinates: number[][]): Float32Array {
  const points: number[] = [];
  const vector = ([lon, lat]: number[]) => [Math.cos(lon * RAD) * Math.cos(lat * RAD), Math.sin(lon * RAD) * Math.cos(lat * RAD), Math.sin(lat * RAD)];
  const append = (a: number[], b: number[]) => {
    const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
    if (dot < 0.9945218954) { // six degrees
      const middle = a.map((x, i) => x + b[i]);
      const length = Math.hypot(...middle);
      if (length > 0.0001) {
        const unit = middle.map((x) => x / length);
        append(a, unit); append(unit, b);
        return;
      }
    }
    points.push(...b);
  };
  if (!coordinates.length) return new Float32Array();
  let previous = vector(coordinates[0]);
  points.push(...previous);
  for (let i = 1; i < coordinates.length; i++) {
    const next = vector(coordinates[i]);
    append(previous, next);
    previous = next;
  }
  return new Float32Array(points);
}

// Same longitude / latitude / roll rotation as d3's orthographic projection,
// expressed as a matrix so drawing the fill needs no per-vertex trig or GeoJSON clipping.
function cameraMatrix(camera: SurfaceCamera) {
  const lon = camera.longitude * RAD;
  const tilt = camera.tilt * RAD;
  const roll = camera.roll * RAD;
  const cl = Math.cos(lon), sl = Math.sin(lon);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return [
    -sl * cr + cl * st * sr, cl * cr + sl * st * sr, -ct * sr,
    -cl * st * cr - sl * sr, -sl * st * cr + cl * sr, ct * cr,
    cl * ct, sl * ct, st,
  ];
}

export function projectSurfacePoint(point: readonly number[], camera: SurfaceCamera) {
  const m = cameraMatrix(camera);
  const [x, y, z] = point;
  return [
    camera.center + camera.radius * (m[0] * x + m[1] * y + m[2] * z),
    camera.center - camera.radius * (m[3] * x + m[4] * y + m[5] * z),
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Front-face projection with segment clipping at the horizon. One SVG path. */
export function projectSurfaceStrokes(strokes: readonly Float32Array[], camera: SurfaceCamera) {
  const m = cameraMatrix(camera);
  const { center, radius } = camera;
  let path = '';
  const xy = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  for (const stroke of strokes) {
    let px = 0, py = 0, pd = 0;
    for (let i = 0; i < stroke.length; i += 3) {
      const x = stroke[i], y = stroke[i + 1], z = stroke[i + 2];
      const sx = center + radius * (m[0] * x + m[1] * y + m[2] * z);
      const sy = center - radius * (m[3] * x + m[4] * y + m[5] * z);
      const depth = m[6] * x + m[7] * y + m[8] * z;
      if (i === 0) {
        if (depth >= 0) path += `M${xy(sx, sy)}`;
      } else if ((pd >= 0) !== (depth >= 0)) {
        // Clip the 3D chord at the camera's depth=0 plane. The short sampling
        // intervals keep this within a fraction of a pixel of the sphere's rim.
        const t = pd / (pd - depth);
        path += `${pd >= 0 ? 'L' : 'M'}${xy(px + t * (sx - px), py + t * (sy - py))}`;
        if (depth >= 0) path += `L${xy(sx, sy)}`;
      } else if (depth >= 0) {
        path += `L${xy(sx, sy)}`;
      }
      px = sx; py = sy; pd = depth;
    }
  }
  return path;
}

/** Project small tapered ink ribbons, clipping polygons at the horizon plane. */
export function projectSurfaceRibbons(ribbons: readonly Float32Array[], camera: SurfaceCamera) {
  const m = cameraMatrix(camera);
  const { center, radius } = camera;
  let path = '';
  for (const ribbon of ribbons) {
    let part = '';
    const append = (x: number, y: number) => { part += `${part ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; };
    const last = ribbon.length - 3;
    let px = center + radius * (m[0] * ribbon[last] + m[1] * ribbon[last + 1] + m[2] * ribbon[last + 2]);
    let py = center - radius * (m[3] * ribbon[last] + m[4] * ribbon[last + 1] + m[5] * ribbon[last + 2]);
    let pd = m[6] * ribbon[last] + m[7] * ribbon[last + 1] + m[8] * ribbon[last + 2];
    for (let i = 0; i < ribbon.length; i += 3) {
      const x = ribbon[i], y = ribbon[i + 1], z = ribbon[i + 2];
      const sx = center + radius * (m[0] * x + m[1] * y + m[2] * z);
      const sy = center - radius * (m[3] * x + m[4] * y + m[5] * z);
      const depth = m[6] * x + m[7] * y + m[8] * z;
      if ((pd >= 0) !== (depth >= 0)) {
        const t = pd / (pd - depth);
        append(px + t * (sx - px), py + t * (sy - py));
      }
      if (depth >= 0) append(sx, sy);
      px = sx; py = sy; pd = depth;
    }
    if (part) path += part + 'Z';
  }
  return path;
}
