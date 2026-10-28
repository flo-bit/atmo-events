import { writeFileSync } from 'node:fs';
import { bakeLayers } from '../src/lib/components/globe/bake';
import { encodeLayers } from '../src/lib/components/globe/layers';

const bytes = encodeLayers(bakeLayers());
writeFileSync(new URL('../src/lib/components/globe/data/globe.bin', import.meta.url), bytes);
console.log(`globe.bin: ${(bytes.length / 1024).toFixed(1)} KB`);
