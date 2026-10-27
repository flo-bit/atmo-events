import { describe, expect, it } from 'vitest';
import { CENTER, makeFrame, makeProjection, RADIUS, ROLL, TILT } from './geometry';
import { makeGeographicStroke, makeSurfaceStrokes, projectSurfacePoint, projectSurfaceStrokes } from './surface';

const camera = (longitude: number) => ({ longitude, tilt: TILT, roll: ROLL, radius: RADIUS, center: CENTER });
const vector = (lon: number, lat: number) => {
  const r = Math.PI / 180;
  return [Math.cos(lon * r) * Math.cos(lat * r), Math.sin(lon * r) * Math.cos(lat * r), Math.sin(lat * r)];
};

describe('surface-attached pen shading', () => {
  it('uses exactly the same projection as the continents at all rotations', () => {
    for (const longitude of [-180, -90, -25, 0, 75, 180]) {
      for (const [lon, lat] of [[13, 52], [-74, 40], [139, 35], [18, -34], [179, 70], [0, -89]]) {
        const projected = projectSurfacePoint(vector(lon, lat), camera(longitude));
        const geographic = makeProjection(longitude)([lon, lat])!;
        expect(projected[0]).toBeCloseTo(geographic[0], 8);
        expect(projected[1]).toBeCloseTo(geographic[1], 8);
      }
    }
  });

  it('generates stable unit-sphere geometry only once, not view-dependent noise', () => {
    const strokes = makeSurfaceStrokes();
    expect(strokes).toEqual(makeSurfaceStrokes());
    const vertices = strokes.reduce((sum, stroke) => sum + stroke.length / 3, 0);
    expect(vertices).toBeLessThan(9000);
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.length; i += 3) {
        expect(Math.hypot(stroke[i], stroke[i + 1], stroke[i + 2])).toBeCloseTo(1, 6);
      }
    }
  });

  it('keeps the denser fill and longer pen strokes', () => {
    const strokes = makeSurfaceStrokes();
    expect(strokes.length).toBeGreaterThan(2500);
    const longStrokes = strokes.filter((stroke) => {
      const end = stroke.length - 3;
      const dot = stroke[0] * stroke[end] + stroke[1] * stroke[end + 1] + stroke[2] * stroke[end + 2];
      return Math.acos(Math.max(-1, Math.min(1, dot))) > 8.5 * Math.PI / 180;
    });
    expect(longStrokes.length).toBeGreaterThan(50);
  });

  it('rotates the strokes with the land and returns them to the same place', () => {
    const strokes = makeSurfaceStrokes();
    const start = projectSurfaceStrokes(strokes, camera(-25));
    expect(start).not.toBe(projectSurfaceStrokes(strokes, camera(15)));
    expect(start).toBe(projectSurfaceStrokes(strokes, camera(335)));
    expect(start).not.toMatch(/NaN|Infinity/);
  });

  it('foreshortens surface details toward the horizon', () => {
    const a = vector(-3, 0), b = vector(3, 0);
    const distance = (longitude: number) => {
      const p = projectSurfacePoint(a, camera(longitude));
      const q = projectSurfacePoint(b, camera(longitude));
      return Math.hypot(p[0] - q[0], p[1] - q[1]);
    };
    expect(distance(75)).toBeLessThan(distance(0) * 0.4);
  });

  it('does not draw the back hemisphere', () => {
    const back = new Float32Array([...vector(160, 0), ...vector(170, 0)]);
    expect(projectSurfaceStrokes([back], camera(0))).toBe('');
  });

  it('clips a stroke crossing the horizon instead of drawing across the back', () => {
    const crossing = new Float32Array([...vector(85, 0), ...vector(95, 0)]);
    const path = projectSurfaceStrokes([crossing], camera(0));
    expect(path).toMatch(/^M[\d.,-]+L[\d.,-]+$/);
    const points = [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
    for (const point of points) {
      expect(Math.hypot(Number(point[1]) - CENTER, Number(point[2]) - CENTER)).toBeLessThanOrEqual(RADIUS + 0.1);
    }
  });

  it('caches coastline vectors with bounded segment lengths and closed rings', () => {
    const stroke = makeGeographicStroke([[0, 0], [30, 0], [30, 20], [0, 0]]);
    expect([...stroke.slice(0, 3)]).toEqual([...stroke.slice(-3)]);
    for (let i = 3; i < stroke.length; i += 3) {
      const dot = stroke[i] * stroke[i - 3] + stroke[i + 1] * stroke[i - 2] + stroke[i + 2] * stroke[i - 1];
      expect(dot).toBeGreaterThanOrEqual(Math.cos(6 * Math.PI / 180) - 0.000001);
    }
    expect(makeGeographicStroke([])).toHaveLength(0);
  });

  it('skips all fill projection work when disabled', () => {
    expect(makeFrame(0, true, false).scribble).toBe('');
    expect(makeFrame(0, true, true).scribble).not.toBe('');
  });
});
