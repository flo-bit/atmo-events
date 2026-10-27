/** Browser-frame-aligned rate limiting. Deadlines don't drift with render time. */
export function createFrameGate(fps: number, startedAt: number) {
  const interval = 1000 / Math.max(1, Math.min(60, Number.isFinite(fps) ? fps : 30));
  let next = startedAt;
  return (timestamp: number) => {
    if (timestamp + 0.5 < next) return false;
    // Skip missed slots, never replay them or add a timer after rendering.
    next += Math.max(1, Math.floor((timestamp - next) / interval) + 1) * interval;
    return true;
  };
}
