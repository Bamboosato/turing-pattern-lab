import { describe, expect, it } from 'vitest';
import { SEED_MODE_OPTIONS, isSeedMode } from './seedModes';

describe('seed modes', () => {
  it('exposes every supported initial pattern once', () => {
    const values = SEED_MODE_OPTIONS.map((option) => option.value);

    expect(values).toEqual(['center', 'stripe', 'spots', 'web', 'noise']);
    expect(new Set(values).size).toBe(values.length);
  });

  it('validates stored seed mode values', () => {
    for (const option of SEED_MODE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(isSeedMode(option.value)).toBe(true);
    }

    expect(isSeedMode('random')).toBe(false);
    expect(isSeedMode(null)).toBe(false);
  });
});
