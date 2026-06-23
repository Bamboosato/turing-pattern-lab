import { describe, expect, it } from 'vitest';
import {
  MOTION_SHAKE_MAX_OFFSET,
  createMotionShakeState,
  settleMotionShakeState,
  updateMotionShakeState,
} from './motionShake';

describe('motion shake state', () => {
  it('uses the first sensor sample as a baseline without moving the canvas', () => {
    const state = updateMotionShakeState(createMotionShakeState(), { x: 1.5, y: -2 });

    expect(state.hasSample).toBe(true);
    expect(state.lastX).toBe(1.5);
    expect(state.lastY).toBe(-2);
    expect(state.offsetX).toBe(0);
    expect(state.offsetY).toBe(0);
  });

  it('turns a sharp acceleration change into a bounded canvas offset', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: 80, y: -80 });

    expect(moved.offsetX).toBeGreaterThan(0);
    expect(moved.offsetY).toBeLessThan(0);
    expect(Math.abs(moved.offsetX)).toBeLessThanOrEqual(MOTION_SHAKE_MAX_OFFSET);
    expect(Math.abs(moved.offsetY)).toBeLessThanOrEqual(MOTION_SHAKE_MAX_OFFSET);
  });

  it('decays motion offsets back toward rest when no new sample arrives', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: 4, y: 0 });
    const settled = settleMotionShakeState(moved);

    expect(settled.offsetX).toBeLessThan(moved.offsetX);
    expect(settled.offsetY).toBe(0);
  });

  it('ignores invalid sensor values instead of producing NaN offsets', () => {
    const baseline = updateMotionShakeState(createMotionShakeState(), { x: 0, y: 0 });
    const moved = updateMotionShakeState(baseline, { x: Number.NaN, y: undefined });

    expect(Number.isNaN(moved.offsetX)).toBe(false);
    expect(Number.isNaN(moved.offsetY)).toBe(false);
  });
});
