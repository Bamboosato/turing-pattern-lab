import type { SimulationState } from './types';
import {
  DEFAULT_PATTERN_PALETTE,
  getPaletteColors,
  mixRgbColors,
  type PatternPalette,
} from './palette';

export function writePatternImageData(
  state: SimulationState,
  imageData: ImageData,
  palette: PatternPalette = DEFAULT_PATTERN_PALETTE,
): void {
  const pixels = imageData.data;
  const colors = getPaletteColors(palette);

  for (let index = 0; index < state.b.length; index += 1) {
    const b = state.b[index];
    const intensity = Math.max(0, Math.min(1, (b - 0.12) * 4.4));
    const color = mixRgbColors(colors.background, colors.material, intensity);
    const pixelIndex = index * 4;

    pixels[pixelIndex] = color.r;
    pixels[pixelIndex + 1] = color.g;
    pixels[pixelIndex + 2] = color.b;
    pixels[pixelIndex + 3] = 255;
  }
}
