import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bakeLayers } from './bake';
import { makeCamera } from './geometry';
import { decodeLayers, encodeLayers, LAYERS } from './layers';
import { traceSurfaceRibbons, traceSurfaceStrokes } from './surface';
import { pathData } from './test-path';

const baked = bakeLayers();
const shipped = decodeLayers(readFileSync(new URL('./data/globe.bin', import.meta.url)));

describe('baked globe geometry', () => {
  it('ships the current artwork (run `pnpm generate:globe` after changing it)', () => {
    expect(readFileSync(new URL('./data/globe.bin', import.meta.url))).toEqual(Buffer.from(encodeLayers(baked)));
  });

  it('keeps every stroke within a twentieth of a pixel after quantization', () => {
    const tolerance = 0.05 / 259;
    for (const name of LAYERS) {
      expect(shipped[name].map((stroke) => stroke.length)).toEqual(baked[name].map((stroke) => stroke.length));
      baked[name].forEach((stroke, s) => {
        for (let i = 0; i < stroke.length; i++) {
          expect(Math.abs(shipped[name][s][i] - stroke[i])).toBeLessThan(tolerance);
        }
      });
    }
  });

  it('draws finite, deterministic paths at every angle', () => {
    for (let longitude = -180; longitude < 180; longitude += 20) {
      const camera = makeCamera(longitude);
      const coasts = pathData((sink) => {
        traceSurfaceStrokes(sink, shipped.coast0, camera);
        traceSurfaceRibbons(sink, shipped.pressure, camera);
      });
      expect(coasts).toMatch(/^M/);
      expect(coasts).not.toMatch(/NaN|Infinity|undefined/);
      expect(coasts).toBe(pathData((sink) => {
        traceSurfaceStrokes(sink, shipped.coast0, camera);
        traceSurfaceRibbons(sink, shipped.pressure, camera);
      }));
    }
  });
});
