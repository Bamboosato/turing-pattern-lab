import type { ReactionDiffusionParams, SeedMode, SimulationState } from './types';

const WEIGHT_CARDINAL = 0.2;
const WEIGHT_DIAGONAL = 0.05;
const CENTER_WEIGHT = -1;

export function createSimulationState(
  width: number,
  height: number,
  seedMode: SeedMode = 'center',
): SimulationState {
  const cellCount = width * height;
  const state: SimulationState = {
    width,
    height,
    a: new Float32Array(cellCount),
    b: new Float32Array(cellCount),
    nextA: new Float32Array(cellCount),
    nextB: new Float32Array(cellCount),
  };

  state.a.fill(1);
  seedPattern(state, seedMode);

  return state;
}

export function stepSimulation(
  state: SimulationState,
  params: ReactionDiffusionParams,
  iterations = 1,
): void {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const { width, height, a, b, nextA, nextB } = state;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;
        const index = y * width + x;
        const currentA = a[index];
        const currentB = b[index];
        const reaction = currentA * currentB * currentB;

        const laplaceA = laplace(a, width, xLeft, x, xRight, yUp, y, yDown);
        const laplaceB = laplace(b, width, xLeft, x, xRight, yUp, y, yDown);

        nextA[index] = clamp01(
          currentA + params.diffA * laplaceA - reaction + params.feed * (1 - currentA),
        );
        nextB[index] = clamp01(
          currentB +
            params.diffB * laplaceB +
            reaction -
            (params.kill + params.feed) * currentB,
        );
      }
    }

    state.a = nextA;
    state.b = nextB;
    state.nextA = a;
    state.nextB = b;
  }
}

function seedPattern(state: SimulationState, seedMode: SeedMode): void {
  const { width, height, a, b } = state;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  if (seedMode === 'noise') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.random() > 0.92) {
          paintDisc(a, b, width, height, x, y, 2);
        }
      }
    }
    return;
  }

  if (seedMode === 'stripe') {
    const stripeWidth = Math.max(5, Math.floor(width * 0.035));
    for (let x = Math.floor(width * 0.18); x < width * 0.82; x += stripeWidth * 3) {
      for (let y = Math.floor(height * 0.18); y < height * 0.82; y += 1) {
        paintDisc(a, b, width, height, x + Math.round(Math.sin(y * 0.09) * 6), y, 2);
      }
    }
    return;
  }

  if (seedMode === 'spots') {
    const radius = Math.max(4, Math.floor(width * 0.028));
    const points = [
      [0.34, 0.34],
      [0.5, 0.3],
      [0.66, 0.36],
      [0.38, 0.53],
      [0.58, 0.54],
      [0.48, 0.7],
      [0.7, 0.68],
    ];
    points.forEach(([x, y]) => paintDisc(a, b, width, height, x * width, y * height, radius));
    return;
  }

  if (seedMode === 'web') {
    const radius = Math.max(3, Math.floor(width * 0.022));
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 7) {
      for (let distance = width * 0.08; distance < width * 0.34; distance += width * 0.055) {
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        paintDisc(a, b, width, height, x, y, radius);
      }
    }
    return;
  }

  paintDisc(a, b, width, height, centerX, centerY, Math.floor(width * 0.055));
  paintDisc(a, b, width, height, centerX - width * 0.12, centerY + height * 0.08, 6);
  paintDisc(a, b, width, height, centerX + width * 0.1, centerY - height * 0.1, 5);
}

function paintDisc(
  a: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  const radiusSquared = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy <= radiusSquared) {
        const index = y * width + x;
        a[index] = 0.35;
        b[index] = 0.7;
      }
    }
  }
}

function laplace(
  values: Float32Array,
  width: number,
  xLeft: number,
  x: number,
  xRight: number,
  yUp: number,
  y: number,
  yDown: number,
): number {
  return (
    values[y * width + x] * CENTER_WEIGHT +
    values[y * width + xLeft] * WEIGHT_CARDINAL +
    values[y * width + xRight] * WEIGHT_CARDINAL +
    values[yUp * width + x] * WEIGHT_CARDINAL +
    values[yDown * width + x] * WEIGHT_CARDINAL +
    values[yUp * width + xLeft] * WEIGHT_DIAGONAL +
    values[yUp * width + xRight] * WEIGHT_DIAGONAL +
    values[yDown * width + xLeft] * WEIGHT_DIAGONAL +
    values[yDown * width + xRight] * WEIGHT_DIAGONAL
  );
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
