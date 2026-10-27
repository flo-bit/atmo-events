import { describe, expect, it } from 'vitest';
import { createFrameGate } from './timing';

describe('display-aligned frame pacing', () => {
  it.each([60, 90, 120, 144])('holds 30 fps on a %i Hz display without timer drift', (hz) => {
    const due = createFrameGate(30, 0);
    const draws: number[] = [];
    for (let i = 0; i <= hz * 10; i++) {
      const timestamp = i * 1000 / hz;
      if (due(timestamp)) draws.push(timestamp);
    }
    expect(draws.length).toBeGreaterThanOrEqual(300);
    expect(draws.length).toBeLessThanOrEqual(301);
    const gaps = draws.slice(1).map((t, i) => t - draws[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1000 / 30 + 1000 / hz + 0.01);
  });

  it('tolerates sub-millisecond display jitter instead of dropping a whole frame', () => {
    const due = createFrameGate(30, 0);
    expect(due(0)).toBe(true);
    expect(due(16.7)).toBe(false);
    expect(due(33.2)).toBe(true);
    expect(due(49.9)).toBe(false);
    expect(due(66.8)).toBe(true);
  });

  it('skips missed slots instead of producing a burst of catch-up renders', () => {
    const due = createFrameGate(30, 0);
    due(0);
    expect(due(500)).toBe(true);
    expect(due(500.1)).toBe(false);
    expect(due(516)).toBe(false);
    expect(due(533.4)).toBe(true);
  });

  it('allows direct interaction to run on every 60 Hz display frame', () => {
    const due = createFrameGate(60, 0);
    for (let i = 0; i < 60; i++) expect(due(i * 1000 / 60)).toBe(true);
  });
});
