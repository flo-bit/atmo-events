import { geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import land from './data/land.json';
import { makeSurfaceStrokes, projectSurfaceRibbons, projectSurfaceStrokes } from './surface';
import { makeCoastGestures, makeCoastPressure, makeCoastRetraces, sketchCoast } from './pen';

export const SIZE = 640;
export const RADIUS = 259;
export const CENTER = SIZE / 2;
export const TILT = 14;
export const ROLL = -8;
let surfaceStrokes: Float32Array[] | undefined;
const RAD = Math.PI / 180;

// Three pressure weights, stable between frames. Geography is local Natural Earth 110m data.
const polygons = (land as unknown as FeatureCollection<MultiPolygon>).features[0].geometry.coordinates;
const drawnPolygons = polygons.map((polygon) => polygon.map(sketchCoast));
const coastGroups = [0, 1, 2].map((group) => drawnPolygons
  .filter((_, i) => i % 3 === group)
  .flatMap((polygon) => polygon.flatMap(makeCoastGestures)));
const grid = geoGraticule().step([45, 30]).precision(6)();

const pressure = makeCoastPressure(drawnPolygons);
const retraces = makeCoastRetraces(drawnPolygons);

export function makeProjection(longitude: number) {
  return geoOrthographic()
    .translate([CENTER, CENTER])
    .scale(RADIUS)
    .rotate([-longitude, -TILT, ROLL])
    .clipAngle(90)
    .precision(0.65);
}

export function makeFrame(longitude: number, showGrid = true, showFill = true) {
  const projection = makeProjection(longitude);
  const path = geoPath(projection).digits(1);
  const camera = { longitude, tilt: TILT, roll: ROLL, radius: RADIUS, center: CENTER };
  return {
    projection,
    coasts: coastGroups.map((group) => projectSurfaceStrokes(group, camera)),
    pressure: projectSurfaceRibbons(pressure, camera),
    retrace: projectSurfaceStrokes(retraces, camera),
    scribble: showFill ? projectSurfaceStrokes(surfaceStrokes ??= makeSurfaceStrokes(), camera) : '',
    grid: showGrid ? path(grid) ?? '' : '',
  };
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

