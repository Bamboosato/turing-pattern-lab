import { describe, expect, it } from 'vitest';
import {
  USER_PRESETS_STORAGE_KEY,
  createUserPreset,
  getDefaultUserPresetName,
  loadUserPresets,
  parseUserPresets,
  saveUserPresets,
} from './userPresets';

function createMemoryStorage(initialValue?: string): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set(USER_PRESETS_STORAGE_KEY, initialValue);
  }

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('user presets', () => {
  it('creates a saved preset from the current simulation settings', () => {
    const preset = createUserPreset({
      name: '  Random keeper  ',
      params: {
        feed: 0.03403,
        kill: 0.06197,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'spots',
      palette: {
        background: '#ABCDEF',
        material: ' #123456 ',
      },
      scalePercent: 150,
      now: () => 123456,
      random: () => 0.5,
    });

    expect(preset.id).toMatch(/^user:/);
    expect(preset.name).toBe('Random keeper');
    expect(preset.params.feed).toBe(0.034);
    expect(preset.params.kill).toBe(0.062);
    expect(preset.seedMode).toBe('spots');
    expect(preset.palette).toEqual({
      background: '#abcdef',
      material: '#123456',
    });
    expect(preset.scalePercent).toBe(150);
    expect(preset.description).toContain('Feed 0.0340');
  });

  it('parses only valid localStorage entries', () => {
    const validPreset = createUserPreset({
      name: 'Valid',
      params: {
        feed: 0.029,
        kill: 0.057,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'center',
      now: () => 1,
      random: () => 0.1,
    });

    expect(parseUserPresets(JSON.stringify([validPreset, { id: 'bad' }]))).toEqual([validPreset]);
    expect(parseUserPresets('not-json')).toEqual([]);
  });

  it('keeps legacy saved presets that do not include colors', () => {
    const legacyPreset = createUserPreset({
      name: 'Legacy',
      params: {
        feed: 0.029,
        kill: 0.057,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'center',
      now: () => 3,
      random: () => 0.3,
    });

    expect(parseUserPresets(JSON.stringify([legacyPreset]))).toEqual([legacyPreset]);
  });

  it('ignores invalid saved colors without dropping the preset', () => {
    const preset = createUserPreset({
      name: 'Color damaged',
      params: {
        feed: 0.034,
        kill: 0.062,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'spots',
      now: () => 4,
      random: () => 0.4,
    });

    expect(
      parseUserPresets(
        JSON.stringify([
          {
            ...preset,
            palette: {
              background: 'bad',
              material: '#ffffff',
            },
          },
        ]),
      ),
    ).toEqual([preset]);
  });

  it('ignores invalid saved scale values without dropping the preset', () => {
    const preset = createUserPreset({
      name: 'Scale damaged',
      params: {
        feed: 0.034,
        kill: 0.062,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'spots',
      now: () => 5,
      random: () => 0.5,
    });

    expect(
      parseUserPresets(
        JSON.stringify([
          {
            ...preset,
            scalePercent: 205,
          },
        ]),
      ),
    ).toEqual([preset]);
  });

  it('saves and loads presets through storage', () => {
    const storage = createMemoryStorage();
    const preset = createUserPreset({
      name: '',
      params: {
        feed: 0.05,
        kill: 0.063,
        diffA: 1,
        diffB: 0.5,
      },
      seedMode: 'web',
      palette: {
        background: '#111111',
        material: '#eeeeee',
      },
      scalePercent: 200,
      now: () => 2,
      random: () => 0.2,
    });

    saveUserPresets([preset], storage);

    expect(loadUserPresets(storage)).toEqual([
      {
        ...preset,
        name: 'Custom Pattern',
      },
    ]);
  });

  it('generates default names from the current saved preset count', () => {
    expect(getDefaultUserPresetName(0)).toBe('Custom 1');
    expect(getDefaultUserPresetName(4)).toBe('Custom 5');
  });
});
