/** Pen layers on the unit sphere, in drawing order. Baked offline by `pnpm generate:globe`. */
export const LAYERS = ['fill', 'grid', 'coast0', 'coast1', 'coast2', 'pressure', 'retrace'] as const;
export type GlobeLayers = Record<(typeof LAYERS)[number], Float32Array[]>;

// Hundredths of a degree: 0.05px at the globe's 259px radius.
const SCALE = 100;
const RAD = Math.PI / 180;

/** Varint stroke and vertex counts, then zigzag varint lon/lat deltas that run on across strokes. */
export function encodeLayers(layers: GlobeLayers): Uint8Array {
  const bytes: number[] = [];
  const write = (value: number) => {
    while (value > 127) {
      bytes.push((value & 127) | 128);
      value >>>= 7;
    }
    bytes.push(value);
  };
  const writeSigned = (value: number) => write(value < 0 ? -2 * value - 1 : 2 * value);
  let lon = 0, lat = 0;
  for (const name of LAYERS) {
    write(layers[name].length);
    for (const stroke of layers[name]) {
      write(stroke.length / 3);
      for (let i = 0; i < stroke.length; i += 3) {
        const x = stroke[i], y = stroke[i + 1], z = stroke[i + 2];
        const nextLon = Math.round(Math.atan2(y, x) / RAD * SCALE);
        const nextLat = Math.round(Math.asin(Math.max(-1, Math.min(1, z))) / RAD * SCALE);
        writeSigned(nextLon - lon);
        writeSigned(nextLat - lat);
        lon = nextLon; lat = nextLat;
      }
    }
  }
  return new Uint8Array(bytes);
}

export function decodeLayers(bytes: Uint8Array): GlobeLayers {
  let at = 0;
  const read = () => {
    let value = 0, shift = 0, byte;
    do {
      byte = bytes[at++];
      value += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    return value;
  };
  const readSigned = () => {
    const value = read();
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  const layers = {} as GlobeLayers;
  let lon = 0, lat = 0;
  for (const name of LAYERS) {
    layers[name] = Array.from({ length: read() }, () => {
      const stroke = new Float32Array(read() * 3);
      for (let i = 0; i < stroke.length; i += 3) {
        lon += readSigned();
        lat += readSigned();
        const l = lon / SCALE * RAD, p = lat / SCALE * RAD;
        stroke[i] = Math.cos(p) * Math.cos(l);
        stroke[i + 1] = Math.cos(p) * Math.sin(l);
        stroke[i + 2] = Math.sin(p);
      }
      return stroke;
    });
  }
  return layers;
}
