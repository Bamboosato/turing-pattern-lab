import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PATTERN_PALETTE,
  getPaletteColors,
  hexToRgb,
  isDefaultPatternPalette,
  mixRgbColors,
  normalizeHexColor,
} from './palette';

describe('pattern palette helpers', () => {
  it('normalizes valid hex colors for color input state', () => {
    expect(normalizeHexColor('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHexColor(' #123456 ')).toBe('#123456');
  });

  it('rejects invalid hex colors', () => {
    expect(normalizeHexColor('123456')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('#zzzzzz')).toBeNull();
  });

  it('converts hex colors to RGB channels', () => {
    expect(hexToRgb('#2edeef')).toEqual({ r: 46, g: 222, b: 239 });
  });

  it('falls back to the default palette when stored colors are invalid', () => {
    expect(getPaletteColors({ background: 'bad', material: '#ffffff' }).background).toEqual(
      hexToRgb(DEFAULT_PATTERN_PALETTE.background),
    );
  });

  it('identifies whether a palette is at its reset state', () => {
    expect(isDefaultPatternPalette(DEFAULT_PATTERN_PALETTE)).toBe(true);
    expect(isDefaultPatternPalette({ background: '#E6B01A', material: '#2EDEEF' })).toBe(true);
    expect(isDefaultPatternPalette({ background: '#000000', material: '#2edeef' })).toBe(false);
  });

  it('mixes RGB colors within channel boundaries', () => {
    expect(
      mixRgbColors({ r: 0, g: 10, b: 20 }, { r: 100, g: 110, b: 120 }, 0.5),
    ).toEqual({ r: 50, g: 60, b: 70 });
    expect(mixRgbColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, -1)).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });
    expect(mixRgbColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 2)).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });
});
