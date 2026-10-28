import { makeCamera, SIZE } from './geometry';
import type { GlobeLayers } from './layers';
import { traceSurfaceRibbons, traceSurfaceStrokes } from './surface';

export interface Ink {
  ink: string;
  fill: string;
}

/** Redraws every pen layer in view-box units. One path, one paint call per layer, no DOM work. */
export function drawGlobe(
  ctx: CanvasRenderingContext2D,
  layers: GlobeLayers,
  longitude: number,
  colors: Ink,
  { showFill = true, showGrid = true } = {},
) {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(width / SIZE, 0, 0, height / SIZE, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const camera = makeCamera(longitude);
  const stroke = (strokes: Float32Array[], color: string, lineWidth: number, alpha: number) => {
    ctx.beginPath();
    traceSurfaceStrokes(ctx, strokes, camera);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.stroke();
  };
  if (showFill) stroke(layers.fill, colors.fill, 1.2, 1);
  if (showGrid) stroke(layers.grid, colors.ink, 0.65, 0.14);
  stroke(layers.coast0, colors.ink, 1.1, 0.98);
  stroke(layers.coast1, colors.ink, 1.4, 0.98);
  stroke(layers.coast2, colors.ink, 1.0, 0.98);
  ctx.beginPath();
  traceSurfaceRibbons(ctx, layers.pressure, camera);
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  stroke(layers.retrace, colors.ink, 0.85, 0.65);
  ctx.globalAlpha = 1;
}
