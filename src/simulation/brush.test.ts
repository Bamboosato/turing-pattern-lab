import { describe, expect, it } from 'vitest';
import { injectActivator } from './brush';
import type { SimulationState } from './types';

function createFlatState(width = 12, height = 12): SimulationState {
  const cellCount = width * height;

  return {
    width,
    height,
    a: new Float32Array(cellCount).fill(1),
    b: new Float32Array(cellCount),
    nextA: new Float32Array(cellCount),
    nextB: new Float32Array(cellCount),
  };
}

describe('injectActivator', () => {
  it('adds activator near the brush center without changing global params', () => {
    const state = createFlatState();
    const centerIndex = 6 * state.width + 6;

    const affectedCells = injectActivator(state, 6, 6, { radius: 3, strength: 0.5 });

    expect(affectedCells).toBeGreaterThan(0);
    expect(state.b[centerIndex]).toBeGreaterThan(0);
    expect(state.a[centerIndex]).toBeLessThan(1);
  });

  it('keeps edge injection inside the simulation bounds', () => {
    const state = createFlatState();

    expect(() => injectActivator(state, 0, 0, { radius: 5, strength: 0.6 })).not.toThrow();
    expect(state.b[0]).toBeGreaterThan(0);
  });

  it('does not mutate the state when strength or radius is inactive', () => {
    const state = createFlatState();

    const affectedCells = injectActivator(state, 6, 6, { radius: 0, strength: 0.5 });

    expect(affectedCells).toBe(0);
    expect(Array.from(state.b).every((value) => value === 0)).toBe(true);
    expect(Array.from(state.a).every((value) => value === 1)).toBe(true);
  });

  it('clamps chemical concentrations to the valid range', () => {
    const state = createFlatState();
    const centerIndex = 6 * state.width + 6;
    state.a[centerIndex] = 0.1;
    state.b[centerIndex] = 0.95;

    injectActivator(state, 6, 6, { radius: 3, strength: 10 });

    expect(state.a[centerIndex]).toBeGreaterThanOrEqual(0);
    expect(state.b[centerIndex]).toBeLessThanOrEqual(1);
  });
});
