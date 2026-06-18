import type { SimulationState } from './types';

export function writePatternImageData(state: SimulationState, imageData: ImageData): void {
  const pixels = imageData.data;

  for (let index = 0; index < state.b.length; index += 1) {
    const b = state.b[index];
    const a = state.a[index];
    const contrast = Math.max(0, Math.min(1, (b - 0.12) * 4.4));
    const heat = Math.max(0, Math.min(1, (a - b) * 1.2));
    const pixelIndex = index * 4;

    pixels[pixelIndex] = Math.round(18 + contrast * 28 + heat * 212);
    pixels[pixelIndex + 1] = Math.round(20 + contrast * 202 + heat * 156);
    pixels[pixelIndex + 2] = Math.round(26 + contrast * 183 + (1 - heat) * 30);
    pixels[pixelIndex + 3] = 255;
  }
}
