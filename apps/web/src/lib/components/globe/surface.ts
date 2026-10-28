/** Stable pen strokes on a unit sphere, rather than a screen-space SVG pattern. */
export interface SurfaceCamera {
  longitude: number;
  tilt: number;
  roll: number;
  radius: number;
  center: number;
}

/** CanvasRenderingContext2D and Path2D both satisfy this. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

const RAD = Math.PI / 180;

/** Cache a coastline as xyz too. Densify long edges once, not on every redraw. */
export function makeGeographicStroke(coordinates: number[][], maxDegrees = 6): Float32Array {
  const points: number[] = [];
  const minDot = Math.cos(maxDegrees * RAD);
  const vector = ([lon, lat]: number[]) => [Math.cos(lon * RAD) * Math.cos(lat * RAD), Math.sin(lon * RAD) * Math.cos(lat * RAD), Math.sin(lat * RAD)];
  const append = (a: number[], b: number[]) => {
    const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
    if (dot < minDot) {
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
// expressed as a matrix so drawing needs no per-vertex trig or GeoJSON clipping.
function cameraMatrix(camera: SurfaceCamera) {
  const lon = camera.longitude * RAD;
  const tilt = camera.tilt * RAD;
  const roll = camera.roll * RAD;
  const cl = Math.cos(lon), sl = Math.sin(lon);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const { radius: r } = camera;
  // Rows: screen x and y, pre-scaled by the radius, then depth.
  return [
    r * (-sl * cr + cl * st * sr), r * (cl * cr + sl * st * sr), r * (-ct * sr),
    -r * (-cl * st * cr - sl * sr), -r * (-sl * st * cr + cl * sr), -r * (ct * cr),
    cl * ct, sl * ct, st,
  ];
}

export function projectSurfacePoint(point: readonly number[], camera: SurfaceCamera) {
  const m = cameraMatrix(camera);
  const [x, y, z] = point;
  return [
    camera.center + m[0] * x + m[1] * y + m[2] * z,
    camera.center + m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Front-face projection with segment clipping at the horizon. */
export function traceSurfaceStrokes(sink: PathSink, strokes: readonly Float32Array[], camera: SurfaceCamera) {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = cameraMatrix(camera);
  const c = camera.center;
  for (const stroke of strokes) {
    let px = 0, py = 0, pd = 0;
    for (let i = 0; i < stroke.length; i += 3) {
      const x = stroke[i], y = stroke[i + 1], z = stroke[i + 2];
      const sx = c + m0 * x + m1 * y + m2 * z;
      const sy = c + m3 * x + m4 * y + m5 * z;
      const depth = m6 * x + m7 * y + m8 * z;
      if (i === 0) {
        if (depth >= 0) sink.moveTo(sx, sy);
      } else if ((pd >= 0) !== (depth >= 0)) {
        // Clip the 3D chord at the camera's depth=0 plane. The short sampling
        // intervals keep this within a fraction of a pixel of the sphere's rim.
        const t = pd / (pd - depth);
        const cx = px + t * (sx - px), cy = py + t * (sy - py);
        if (pd >= 0) sink.lineTo(cx, cy);
        else { sink.moveTo(cx, cy); sink.lineTo(sx, sy); }
      } else if (depth >= 0) {
        sink.lineTo(sx, sy);
      }
      px = sx; py = sy; pd = depth;
    }
  }
}

/** Project small tapered ink ribbons, clipping polygons at the horizon plane. */
export function traceSurfaceRibbons(sink: PathSink, ribbons: readonly Float32Array[], camera: SurfaceCamera) {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = cameraMatrix(camera);
  const c = camera.center;
  for (const ribbon of ribbons) {
    let started = false;
    const append = (x: number, y: number) => {
      if (started) sink.lineTo(x, y);
      else { sink.moveTo(x, y); started = true; }
    };
    const last = ribbon.length - 3;
    let px = c + m0 * ribbon[last] + m1 * ribbon[last + 1] + m2 * ribbon[last + 2];
    let py = c + m3 * ribbon[last] + m4 * ribbon[last + 1] + m5 * ribbon[last + 2];
    let pd = m6 * ribbon[last] + m7 * ribbon[last + 1] + m8 * ribbon[last + 2];
    for (let i = 0; i < ribbon.length; i += 3) {
      const x = ribbon[i], y = ribbon[i + 1], z = ribbon[i + 2];
      const sx = c + m0 * x + m1 * y + m2 * z;
      const sy = c + m3 * x + m4 * y + m5 * z;
      const depth = m6 * x + m7 * y + m8 * z;
      if ((pd >= 0) !== (depth >= 0)) {
        const t = pd / (pd - depth);
        append(px + t * (sx - px), py + t * (sy - py));
      }
      if (depth >= 0) append(sx, sy);
      px = sx; py = sy; pd = depth;
    }
    if (started) sink.closePath();
  }
}
