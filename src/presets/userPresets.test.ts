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
      now: () => 123456,
      random: () => 0.5,
    });

    expect(preset.id).toMatch(/^user:/);
    expect(preset.name).toBe('Random keeper');
    expect(preset.params.feed).toBe(0.034);
    expect(preset.params.kill).toBe(0.062);
    expect(preset.seedMode).toBe('spots');
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
