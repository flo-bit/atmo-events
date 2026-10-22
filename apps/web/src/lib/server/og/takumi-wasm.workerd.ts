// Production (workerd) only. unwasm turns this into a Worker WASM module import;
// Node (vite dev, vitest) never loads this file. See takumi.ts.
import wasm from '@takumi-rs/wasm/takumi_wasm_bg.wasm?module';

export default wasm;
