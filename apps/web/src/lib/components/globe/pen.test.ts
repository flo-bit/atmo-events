import { describe, expect, it } from 'vitest';
import { makeCoastGestures, makeCoastPressure, makeCoastRetraces, rimPressure, sketchCoast } from './pen';
import { traceSurfaceRibbons } from './surface';
import { pathData } from './test-path';

const polygons = [[Array.from({ length: 7 }, (_, i) => [i, 0])]];

describe('pen pressure', () => {
  it('adds stable geographic contour drift while keeping rings closed', () => {
    const ring = [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]];
    const drawn = sketchCoast(ring);
    expect(drawn).toEqual(sketchCoast(ring));
    expect(drawn[0]).toEqual(drawn.at(-1));
    expect(drawn).not.toEqual(ring);
    expect(drawn.length).toBeGreaterThan(ring.length);
    expect(drawn.every((point) => point.every(Number.isFinite))).toBe(true);
    expect(sketchCoast([])).toEqual([]);
    expect(ring[1]).toEqual([8, 0]);
  });

  it('uses broken pen gestures for large coasts but keeps small islands intact', () => {
    const ring = Array.from({ length: 101 }, (_, i) => [Math.sin(i / 100 * Math.PI * 2) * 20, Math.cos(i / 100 * Math.PI * 2) * 20]);
    const strokes = makeCoastGestures(ring);
    expect(strokes.length).toBeGreaterThan(1);
    expect(strokes.every((stroke) => stroke.length > 3)).toBe(true);
    expect(makeCoastGestures([[0, 0], [1, 0], [0, 1], [0, 0]])).toHaveLength(1);
  });

  it('creates separate stable corrective strokes rather than duplicating every outline', () => {
    const ring = Array.from({ length: 81 }, (_, i) => [Math.sin(i / 80 * Math.PI * 2) * 20, Math.cos(i / 80 * Math.PI * 2) * 20]);
    const strokes = makeCoastRetraces([[ring]]);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes).toEqual(makeCoastRetraces([[ring]]));
    expect(strokes.reduce((sum, stroke) => sum + stroke.length / 3, 0)).toBeLessThan(ring.length);
  });

  it('actually tapers each ink ribbon rather than using a uniform wide stroke', () => {
    const [ribbon] = makeCoastPressure(polygons);
    const vertices = ribbon.length / 3;
    const widthAt = (i: number) => {
      const opposite = vertices - i - 1;
      return Math.hypot(...[0, 1, 2].map((axis) => ribbon[i * 3 + axis] - ribbon[opposite * 3 + axis]));
    };
    expect(widthAt(3)).toBeGreaterThan(widthAt(0) * 10);
    expect(widthAt(3)).toBeGreaterThan(widthAt(6) * 10);
  });

  it('keeps the pressure geometry attached to the unit sphere', () => {
    for (const ribbon of makeCoastPressure(polygons)) {
      for (let i = 0; i < ribbon.length; i += 3) {
        expect(Math.hypot(ribbon[i], ribbon[i + 1], ribbon[i + 2])).toBeCloseTo(1, 6);
      }
    }
  });

  it('hides pressure strokes on the back and fills only finite front-facing polygons', () => {
    const ribbons = makeCoastPressure(polygons);
    const camera = { longitude: 0, tilt: 14, roll: -8, radius: 259, center: 320 };
    const front = pathData((sink) => traceSurfaceRibbons(sink, ribbons, camera));
    expect(front).toMatch(/^M.*Z$/);
    expect(front).not.toMatch(/NaN|Infinity/);
    expect(pathData((sink) => traceSurfaceRibbons(sink, ribbons, { ...camera, longitude: 180 }))).toBe('');
  });

  it('adds stable tapered sections around the rim without any animation-time randomness', () => {
    const path = rimPressure(259, 320);
    expect(path).toBe(rimPressure(259, 320));
    expect(path).not.toMatch(/NaN|Infinity/);
  });
});
