import type { SimulationState } from './types';

export type BrushOptions = {
  radius: number;
  strength: number;
};

export function injectActivator(
  state: SimulationState,
  centerX: number,
  centerY: number,
  options: BrushOptions,
): number {
  const radius = Math.max(0, options.radius);
  const strength = clamp01(options.strength);

  if (radius <= 0 || strength <= 0) {
    return 0;
  }

  const { width, height, a, b } = state;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  const radiusSquared = radius * radius;
  let affectedCells = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared <= radiusSquared) {
        const index = y * width + x;
        const falloff = 1 - distanceSquared / radiusSquared;
        const amount = strength * falloff;

        b[index] = clamp01(b[index] + amount * (1 - b[index]));
        a[index] = clamp01(a[index] - amount * 0.45 * a[index]);
        affectedCells += 1;
      }
    }
  }

  return affectedCells;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
