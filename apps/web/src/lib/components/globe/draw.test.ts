import { describe, expect, it } from 'vitest';
import { drawGlobe } from './draw';
import type { GlobeLayers } from './layers';
import { LAYERS } from './layers';

const front = new Float32Array([1, 0, 0, 0.99, 0.1, 0]);
const layers = Object.fromEntries(LAYERS.map((name) => [name, [front]])) as GlobeLayers;

function recorder() {
  const strokes: { color: string; width: number }[] = [];
  const ctx = {
    canvas: { width: 1280, height: 1280 },
    strokeStyle: '', lineWidth: 1,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

describe('canvas globe', () => {
  it('skips the fill and guide lines entirely when disabled', () => {
    const all = recorder(), bare = recorder();
    drawGlobe(all.ctx, layers, 0, { ink: 'ink', fill: 'fill' });
    drawGlobe(bare.ctx, layers, 0, { ink: 'ink', fill: 'fill' }, { showFill: false, showGrid: false });
    expect(all.strokes.map((stroke) => stroke.color)).toContain('fill');
    expect(all.strokes.some((stroke) => stroke.width === 0.65)).toBe(true);
    expect(bare.strokes.map((stroke) => stroke.color)).not.toContain('fill');
    expect(bare.strokes.some((stroke) => stroke.width === 0.65)).toBe(false);
    expect(bare.strokes).toHaveLength(all.strokes.length - 2);
  });
});
