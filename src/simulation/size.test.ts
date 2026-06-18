import { describe, expect, it } from 'vitest';
import { getFullscreenSimulationSize, NORMAL_SIMULATION_SIZE } from './size';

describe('getFullscreenSimulationSize', () => {
  it('matches a landscape viewport ratio without using the full screen pixel count', () => {
    const size = getFullscreenSimulationSize(1920, 1080);

    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
    expect(size.width * size.height).toBeLessThanOrEqual(92_000);
  });

  it('matches a portrait viewport ratio', () => {
    const size = getFullscreenSimulationSize(390, 844);

    expect(size.width / size.height).toBeCloseTo(390 / 844, 2);
    expect(size.width).toBeGreaterThanOrEqual(120);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('falls back to the normal square simulation for invalid viewport dimensions', () => {
    expect(getFullscreenSimulationSize(0, 844)).toEqual(NORMAL_SIMULATION_SIZE);
  });
});
