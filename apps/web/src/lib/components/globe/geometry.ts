import { projectSurfacePoint } from './surface';

export const SIZE = 640;
export const RADIUS = 259;
export const CENTER = SIZE / 2;
export const TILT = 14;
export const ROLL = -8;
const RAD = Math.PI / 180;

export function makeCamera(longitude: number) {
  return { longitude, tilt: TILT, roll: ROLL, radius: RADIUS, center: CENTER };
}

/** Screen position in the 640×640 view box and depth (negative is the back of the globe). */
export function projectPoint(lon: number, lat: number, longitude: number) {
  const vector = [Math.cos(lon * RAD) * Math.cos(lat * RAD), Math.sin(lon * RAD) * Math.cos(lat * RAD), Math.sin(lat * RAD)];
  return projectSurfacePoint(vector, makeCamera(longitude));
}

/** Dot product of the point and camera direction; negative means the back of the globe. */
export function pointDepth(lon: number, lat: number, centerLon: number) {
  return Math.sin(lat * RAD) * Math.sin(TILT * RAD)
    + Math.cos(lat * RAD) * Math.cos(TILT * RAD) * Math.cos((lon - centerLon) * RAD);
}

/** Signed shortest arc, including across the antimeridian. */
export function shortestRotation(from: number, to: number) {
  return ((to - from + 180) % 360 + 360) % 360 - 180;
}

/** A fixed, nearly circular pen stroke. No random wobble during animation. */
export function penCircle(radius = RADIUS, phase = 0) {
  return Array.from({ length: 181 }, (_, i) => {
    const a = (i / 180) * Math.PI * 2;
    const r = radius + Math.sin(a * 5 + phase) * 0.9 + Math.cos(a * 9 + phase) * 0.5;
    return `${i === 0 ? 'M' : 'L'}${(CENTER + Math.cos(a) * r).toFixed(2)},${(CENTER + Math.sin(a) * r).toFixed(2)}`;
  }).join('') + 'Z';
}
