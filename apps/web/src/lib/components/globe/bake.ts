import { geoGraticule } from 'd3-geo';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import land from './data/land.json';
import scribbles from './data/scribbles.json';
import { makeCoastGestures, makeCoastPressure, makeCoastRetraces, sketchCoast } from './pen';
import { makeGeographicStroke } from './surface';
import type { GlobeLayers } from './layers';

const RAD = Math.PI / 180;

/** Land-only strokes are baked offline; convert their compact coordinates. */
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

/** Every pen layer, built from local Natural Earth 110m data. Runs at build time only. */
export function bakeLayers(): GlobeLayers {
  const polygons = (land as unknown as FeatureCollection<MultiPolygon>).features[0].geometry.coordinates;
  const drawn = polygons.map((polygon) => polygon.map(sketchCoast));
  // Three pressure weights, stable between frames.
  const [coast0, coast1, coast2] = [0, 1, 2].map((group) => drawn
    .filter((_, i) => i % 3 === group)
    .flatMap((polygon) => polygon.flatMap(makeCoastGestures)));
  return {
    fill: makeSurfaceStrokes(),
    grid: geoGraticule().step([45, 30]).lines().map((line) => makeGeographicStroke(line.coordinates, 3)),
    coast0,
    coast1,
    coast2,
    pressure: makeCoastPressure(drawn),
    retrace: makeCoastRetraces(drawn),
  };
}
