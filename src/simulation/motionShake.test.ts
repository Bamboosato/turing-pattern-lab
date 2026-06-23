import { describe, expect, it } from 'vitest';
import {
  MOTION_SHAKE_MAX_IMPULSE,
  applyMotionShakeDisturbance,
  createMotionShakeState,
  settleMotionShakeState,
  updateMotionShakeState,
} from './motionShake';
import type { SimulationState } from './types';

describe('motion shake state', () => {
  it('uses the first sensor sample as a baseline without disturbing the pattern', () => {
    const state = updateMotionShakeState(createMotionShakeState(), { x: 1.5, y: -2 });

    expect(state.hasSample).toBe(true);
    expect(state.lastX).toBe(1.5);
    expect(state.lastY).toBe(-2);
    expect(state.impulseX).toBe(0);
    expect(state.impulseY).toBe(0);
    expect(state.strength).toBe(0);
  });

  it('turns a sharp acceleration change into a bounded pattern impulse', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: 80, y: -80 });

    expect(moved.impulseX).toBeGreaterThan(0);
    expect(moved.impulseY).toBeLessThan(0);
    expect(moved.strength).toBeGreaterThan(0);
    expect(Math.abs(moved.impulseX)).toBeLessThanOrEqual(MOTION_SHAKE_MAX_IMPULSE);
    expect(Math.abs(moved.impulseY)).toBeLessThanOrEqual(MOTION_SHAKE_MAX_IMPULSE);
  });

  it('decays motion impulses back toward rest when no new sample arrives', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: 4, y: 0 });
    const settled = settleMotionShakeState(moved);

    expect(settled.impulseX).toBeLessThan(moved.impulseX);
    expect(settled.impulseY).toBe(0);
    expect(settled.strength).toBeLessThan(moved.strength);
  });

  it('ignores invalid sensor values instead of producing NaN offsets', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: Number.NaN, y: undefined });

    expect(Number.isNaN(moved.impulseX)).toBe(false);
    expect(Number.isNaN(moved.impulseY)).toBe(false);
    expect(Number.isNaN(moved.strength)).toBe(false);
  });

  it('disturbs the simulation state instead of relying on a canvas transform', () => {
    const state = createSmallState();
    const beforeB = Array.from(state.b);
    const affectedCells = applyMotionShakeDisturbance(state, {
      hasSample: true,
      lastX: 0,
      lastY: 0,
      impulseX: 0.15,
      impulseY: 0,
      strength: 1,
    });

    expect(affectedCells).toBe(25);
    expect(Array.from(state.b)).not.toEqual(beforeB);
    expect(state.b[2 * state.width + 3]).toBeGreaterThan(beforeB[2 * state.width + 3]);
  });
});

function createSmallState(): SimulationState {
  const width = 5;
  const height = 5;
  const cellCount = width * height;
  const a = new Float32Array(cellCount);
  const b = new Float32Array(cellCount);

  a.fill(1);
  b[2 * width + 2] = 1;

  return {
    width,
    height,
    a,
    b,
    nextA: new Float32Array(cellCount),
    nextB: new Float32Array(cellCount),
  };
}
