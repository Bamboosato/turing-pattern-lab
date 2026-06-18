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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundParam(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function generateRandomParams(random = Math.random): RandomPattern {
  const seedModes: SeedMode[] = ['center', 'stripe', 'spots', 'web', 'noise'];

  return {
    params: {
      feed: roundParam(FEED_RANGE.min + random() * (FEED_RANGE.max - FEED_RANGE.min)),
      kill: roundParam(KILL_RANGE.min + random() * (KILL_RANGE.max - KILL_RANGE.min)),
      ...BASE_DIFFUSION,
    },
    seedMode: seedModes[Math.floor(random() * seedModes.length)] ?? 'center',
  };
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
