import { createSimulationState, stepSimulation } from './grayScott';
import type { RandomPattern, ReactionDiffusionParams, SeedMode } from './types';

export const FEED_RANGE = {
  min: 0.012,
  max: 0.07,
} as const;

export const KILL_RANGE = {
  min: 0.045,
  max: 0.072,
} as const;

export const BASE_DIFFUSION = {
  diffA: 1,
  diffB: 0.5,
} as const;

const RANDOM_SEED_MODES: SeedMode[] = ['center', 'stripe', 'spots', 'web'];
const RANDOM_VALIDATION_SIZE = 56;
const RANDOM_VALIDATION_STEPS = 900;
const MAX_RANDOM_ATTEMPTS = 8;

const STABLE_RANDOM_BASES = [
  {
    params: {
      feed: 0.022,
      kill: 0.051,
      ...BASE_DIFFUSION,
    },
    seedMode: 'stripe',
  },
  {
    params: {
      feed: 0.05,
      kill: 0.063,
      ...BASE_DIFFUSION,
    },
    seedMode: 'web',
  },
  {
    params: {
      feed: 0.034,
      kill: 0.062,
      ...BASE_DIFFUSION,
    },
    seedMode: 'spots',
  },
  {
    params: {
      feed: 0.0545,
      kill: 0.062,
      ...BASE_DIFFUSION,
    },
    seedMode: 'center',
  },
  {
    params: {
      feed: 0.029,
      kill: 0.057,
      ...BASE_DIFFUSION,
    },
    seedMode: 'center',
  },
] satisfies RandomPattern[];

export type PatternActivityMetrics = {
  maxB: number;
  standardDeviation: number;
  activeRatio: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundParam(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function generateRandomParams(random = Math.random): RandomPattern {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = generateRandomCandidate(random);

    if (hasSustainedPatternActivity(candidate)) {
      return candidate;
    }
  }

  return generateStableFallback(random);
}

export function measurePatternActivity(values: Float32Array): PatternActivityMetrics {
  let maxB = 0;
  let sum = 0;
  let activeCount = 0;

  for (const value of values) {
    maxB = Math.max(maxB, value);
    sum += value;

    if (value > 0.08) {
      activeCount += 1;
    }
  }

  const mean = sum / values.length;
  let varianceSum = 0;

  for (const value of values) {
    varianceSum += (value - mean) ** 2;
  }

  return {
    maxB,
    standardDeviation: Math.sqrt(varianceSum / values.length),
    activeRatio: activeCount / values.length,
  };
}

export function hasSustainedPatternActivity(pattern: RandomPattern): boolean {
  const state = createSimulationState(
    RANDOM_VALIDATION_SIZE,
    RANDOM_VALIDATION_SIZE,
    pattern.seedMode,
  );

  stepSimulation(state, pattern.params, RANDOM_VALIDATION_STEPS);

  const metrics = measurePatternActivity(state.b);

  return (
    metrics.maxB > 0.08 &&
    metrics.standardDeviation > 0.028 &&
    metrics.activeRatio > 0.025 &&
    metrics.activeRatio < 0.96
  );
}

function generateRandomCandidate(random: () => number): RandomPattern {
  return {
    params: {
      feed: roundParam(FEED_RANGE.min + random() * (FEED_RANGE.max - FEED_RANGE.min)),
      kill: roundParam(KILL_RANGE.min + random() * (KILL_RANGE.max - KILL_RANGE.min)),
      ...BASE_DIFFUSION,
    },
    seedMode: RANDOM_SEED_MODES[Math.floor(random() * RANDOM_SEED_MODES.length)] ?? 'center',
  };
}

function generateStableFallback(random: () => number): RandomPattern {
  const base =
    STABLE_RANDOM_BASES[Math.floor(random() * STABLE_RANDOM_BASES.length)] ?? STABLE_RANDOM_BASES[0];
  const candidate = {
    params: {
      feed: roundParam(
        clamp(base.params.feed + (random() - 0.5) * 0.006, FEED_RANGE.min, FEED_RANGE.max),
      ),
      kill: roundParam(
        clamp(base.params.kill + (random() - 0.5) * 0.004, KILL_RANGE.min, KILL_RANGE.max),
      ),
      ...BASE_DIFFUSION,
    },
    seedMode: base.seedMode,
  };

  return hasSustainedPatternActivity(candidate) ? candidate : base;
}

export function withFeedKill(
  params: ReactionDiffusionParams,
  feed: number,
  kill: number,
): ReactionDiffusionParams {
  return {
    ...params,
    feed: roundParam(clamp(feed, FEED_RANGE.min, FEED_RANGE.max)),
    kill: roundParam(clamp(kill, KILL_RANGE.min, KILL_RANGE.max)),
  };
}
