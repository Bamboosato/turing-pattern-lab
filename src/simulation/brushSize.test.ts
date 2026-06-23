import { describe, expect, it } from 'vitest';
import { getGestureBrushRadius } from './brushSize';
import { NORMAL_SIMULATION_SIZE } from './size';

describe('getGestureBrushRadius', () => {
  it('uses about 80% of the previous default brush radius at 100% scale', () => {
    const previousRadius = Math.max(
      5,
      Math.round(Math.min(NORMAL_SIMULATION_SIZE.width, NORMAL_SIMULATION_SIZE.height) * 0.028),
    );

    expect(previousRadius).toBe(6);
    expect(getGestureBrushRadius(NORMAL_SIMULATION_SIZE, 100)).toBe(5);
  });

  it('keeps the internal radius stable when simulation scale changes', () => {
    expect(getGestureBrushRadius({ width: 112, height: 112 }, 50)).toBe(5);
    expect(getGestureBrushRadius(NORMAL_SIMULATION_SIZE, 100)).toBe(5);
    expect(getGestureBrushRadius({ width: 448, height: 448 }, 200)).toBe(5);
  });

  it('never returns an inactive brush radius for tiny simulations', () => {
    expect(getGestureBrushRadius({ width: 16, height: 16 }, 200)).toBe(4);
  });
});
