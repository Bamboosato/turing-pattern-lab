import { describe, expect, it } from 'vitest';
import { patternPresets } from './presets';
import { FEED_RANGE, KILL_RANGE } from '../simulation/random';
import { createSimulationState, stepSimulation } from '../simulation/grayScott';

describe('patternPresets', () => {
  it('defines the five MVP presets with descriptions', () => {
    expect(patternPresets.map((preset) => preset.name)).toEqual([
      'Zebra',
      'Giraffe',
      'Leopard',
      'Coral',
      'Maze',
    ]);

    for (const preset of patternPresets) {
      expect(preset.description.length).toBeGreaterThan(12);
    }
  });

  it('keeps preset parameters in valid Gray-Scott ranges', () => {
    for (const preset of patternPresets) {
      expect(preset.params.feed).toBeGreaterThanOrEqual(FEED_RANGE.min);
      expect(preset.params.feed).toBeLessThanOrEqual(FEED_RANGE.max);
      expect(preset.params.kill).toBeGreaterThanOrEqual(KILL_RANGE.min);
      expect(preset.params.kill).toBeLessThanOrEqual(KILL_RANGE.max);
      expect(preset.params.diffA).toBeGreaterThan(0);
      expect(preset.params.diffB).toBeGreaterThan(0);
    }
  });

  it('keeps the Coral preset visually active after the first growth phase', () => {
    const coral = patternPresets.find((preset) => preset.id === 'coral');

    expect(coral).toBeDefined();

    if (!coral) {
      return;
    }

    const state = createSimulationState(72, 72, coral.seedMode);

    stepSimulation(state, coral.params, 500);

    const maxB = state.b.reduce((max, value) => Math.max(max, value), 0);

    expect(maxB).toBeGreaterThan(0.08);
  });

  it('keeps the Leopard preset visibly populated after the first growth phase', () => {
    const leopard = patternPresets.find((preset) => preset.id === 'leopard');

    expect(leopard).toBeDefined();

    if (!leopard) {
      return;
    }

    const state = createSimulationState(72, 72, leopard.seedMode);

    stepSimulation(state, leopard.params, 600);

    const activeRatio =
      state.b.reduce((count, value) => count + (value > 0.08 ? 1 : 0), 0) / state.b.length;

    expect(activeRatio).toBeGreaterThan(0.08);
  });

  it('keeps every preset from flattening during the early viewing window', () => {
    for (const preset of patternPresets) {
      const state = createSimulationState(96, 96, preset.seedMode);

      stepSimulation(state, preset.params, 1200);

      const values = Array.from(state.b);
      const maxB = values.reduce((max, value) => Math.max(max, value), 0);
      const meanB = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - meanB) ** 2, 0) / values.length;
      const standardDeviation = Math.sqrt(variance);
      const activeRatio = values.filter((value) => value > 0.08).length / values.length;

      expect.soft(maxB, `${preset.name} should retain visible B concentration`).toBeGreaterThan(0.08);
      expect
        .soft(standardDeviation, `${preset.name} should retain visible contrast`)
        .toBeGreaterThan(0.035);
      expect
        .soft(activeRatio, `${preset.name} should not disappear`)
        .toBeGreaterThan(0.03);
      expect
        .soft(activeRatio, `${preset.name} should not become a uniform fill`)
        .toBeLessThan(0.95);
    }
  });
});
