import type { PathSink } from './surface';

/** SVG path data for whatever a trace function draws, for assertions in tests. */
export function pathData(trace: (sink: PathSink) => void) {
  let d = '';
  const point = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  trace({
    moveTo: (x, y) => { d += `M${point(x, y)}`; },
    lineTo: (x, y) => { d += `L${point(x, y)}`; },
    closePath: () => { d += 'Z'; },
  });
  return d;
}
