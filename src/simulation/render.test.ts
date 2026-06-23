import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERN_PALETTE } from './palette';
import { writePatternImageData } from './render';
import type { SimulationState } from './types';

describe('writePatternImageData', () => {
  it('renders low material concentration with the background color', () => {
    const imageData = createImageData(1);

    writePatternImageData(createState([0]), imageData, {
      background: '#000000',
      material: '#ffffff',
    });

    expect(Array.from(imageData.data)).toEqual([0, 0, 0, 255]);
  });

  it('renders high material concentration with the material color', () => {
    const imageData = createImageData(1);

    writePatternImageData(createState([1]), imageData, {
      background: '#000000',
      material: '#ffffff',
    });

    expect(Array.from(imageData.data)).toEqual([255, 255, 255, 255]);
  });

  it('falls back to the current default colors when palette values are invalid', () => {
    const imageData = createImageData(2);

    writePatternImageData(createState([0, 1]), imageData, {
      background: 'bad',
      material: 'also-bad',
    });

    expect(Array.from(imageData.data.slice(0, 4))).toEqual([230, 176, 26, 255]);
    expect(Array.from(imageData.data.slice(4, 8))).toEqual([46, 222, 239, 255]);
    expect(DEFAULT_PATTERN_PALETTE.background).toBe('#e6b01a');
    expect(DEFAULT_PATTERN_PALETTE.material).toBe('#2edeef');
  });
});

function createImageData(width: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * 4),
    width,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

function createState(bValues: number[]): SimulationState {
  const width = bValues.length;

  return {
    width,
    height: 1,
    a: new Float32Array(width).fill(1),
    b: Float32Array.from(bValues),
    nextA: new Float32Array(width),
    nextB: new Float32Array(width),
  };
}
