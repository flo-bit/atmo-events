import { describe, expect, it } from 'vitest';
import { CENTER, makeFrame, makeProjection, penCircle, pointDepth, RADIUS, shortestRotation, TILT } from './geometry';

describe('orthographic globe', () => {
  it('places the camera direction at the center', () => {
    const point = makeProjection(-25)([-25, TILT])!;
    expect(point[0]).toBeCloseTo(CENTER);
    expect(point[1]).toBeCloseTo(CENTER);
    expect(pointDepth(-25, TILT, -25)).toBeCloseTo(1);
  });

  it('hides the back hemisphere', () => {
    expect(pointDepth(155, -TILT, -25)).toBeCloseTo(-1);
    expect(pointDepth(-74, 40, -25)).toBeGreaterThan(0);
    expect(pointDepth(139, 35, -25)).toBeLessThan(0);
  });

  it('agrees with the projection visibility after arbitrary rotations', () => {
    for (const longitude of [-170, -30, 0, 95, 180]) {
      const projection = makeProjection(longitude);
      const direction = projection.invert!([CENTER, CENTER])!;
      expect(pointDepth(direction[0], direction[1], longitude)).toBeCloseTo(1);
    }
  });

  it('generates finite, deterministic coastlines at every angle', () => {
    for (let lon = -180; lon < 180; lon += 20) {
      const frame = makeFrame(lon);
      expect(frame.coasts).toHaveLength(3);
      expect(frame.coasts.join('')).not.toMatch(/NaN|Infinity|undefined/);
      expect(frame.coasts).toEqual(makeFrame(lon).coasts);
    }
  });

  it('takes the shortest arc to a selected marker, even across the date line', () => {
    expect(shortestRotation(170, -170)).toBe(20);
    expect(shortestRotation(-170, 170)).toBe(-20);
    expect(shortestRotation(-25, 10)).toBe(35);
    expect(shortestRotation(730, 15)).toBe(5);
    expect(shortestRotation(15, 15)).toBe(0);
  });

  it('can skip the guide lines completely', () => {
    expect(makeFrame(10, false).grid).toBe('');
    expect(makeFrame(10, true).grid.length).toBeGreaterThan(0);
  });

  it('uses a stable, subtly irregular circular boundary', () => {
    expect(penCircle()).toEqual(penCircle());
    expect(penCircle()).not.toEqual(penCircle(RADIUS, 2));
    expect(penCircle()).toMatch(/^M.*Z$/);
  });
});
