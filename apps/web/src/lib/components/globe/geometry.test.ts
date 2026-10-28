import { describe, expect, it } from 'vitest';
import { CENTER, penCircle, pointDepth, projectPoint, RADIUS, shortestRotation, TILT } from './geometry';

describe('orthographic globe', () => {
  it('places the camera direction at the center', () => {
    const point = projectPoint(-25, TILT, -25);
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
      for (const [lon, lat] of [[13, 52], [-74, 40], [139, 35], [18, -34], [0, -89]]) {
        expect(projectPoint(lon, lat, longitude)[2]).toBeCloseTo(pointDepth(lon, lat, longitude), 8);
      }
    }
  });

  it('takes the shortest arc to a selected marker, even across the date line', () => {
    expect(shortestRotation(170, -170)).toBe(20);
    expect(shortestRotation(-170, 170)).toBe(-20);
    expect(shortestRotation(-25, 10)).toBe(35);
    expect(shortestRotation(730, 15)).toBe(5);
    expect(shortestRotation(15, 15)).toBe(0);
  });

  it('uses a stable, subtly irregular circular boundary', () => {
    expect(penCircle()).toEqual(penCircle());
    expect(penCircle()).not.toEqual(penCircle(RADIUS, 2));
    expect(penCircle()).toMatch(/^M.*Z$/);
  });
});
