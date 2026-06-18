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
});
