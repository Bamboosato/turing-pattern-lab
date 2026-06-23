export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type PatternPalette = {
  background: string;
  material: string;
};

export const DEFAULT_PATTERN_PALETTE: PatternPalette = {
  background: '#e6b01a',
  material: '#2edeef',
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();

  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function hexToRgb(color: string): RgbColor | null {
  const normalized = normalizeHexColor(color);

  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function getPaletteColors(palette: PatternPalette): {
  background: RgbColor;
  material: RgbColor;
} {
  return {
    background: hexToRgb(palette.background) ?? hexToRgb(DEFAULT_PATTERN_PALETTE.background)!,
    material: hexToRgb(palette.material) ?? hexToRgb(DEFAULT_PATTERN_PALETTE.material)!,
  };
}

export function isDefaultPatternPalette(palette: PatternPalette): boolean {
  return (
    normalizeHexColor(palette.background) === DEFAULT_PATTERN_PALETTE.background &&
    normalizeHexColor(palette.material) === DEFAULT_PATTERN_PALETTE.material
  );
}

export function mixRgbColors(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const clampedAmount = Math.min(1, Math.max(0, amount));

  return {
    r: Math.round(from.r + (to.r - from.r) * clampedAmount),
    g: Math.round(from.g + (to.g - from.g) * clampedAmount),
    b: Math.round(from.b + (to.b - from.b) * clampedAmount),
  };
}
