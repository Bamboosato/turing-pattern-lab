import { describe, expect, it } from 'vitest';
import {
  FEED_RANGE,
  KILL_RANGE,
  generateRandomParams,
  hasSustainedPatternActivity,
  withFeedKill,
} from './random';

function createSeededRandom(seed: number) {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 2 ** 32;
  };
}

describe('generateRandomParams', () => {
  it('returns feed and kill values inside the supported slider ranges', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { params, seedMode } = generateRandomParams(createSeededRandom(seed));

      expect(params.feed).toBeGreaterThanOrEqual(FEED_RANGE.min);
      expect(params.feed).toBeLessThanOrEqual(FEED_RANGE.max);
      expect(params.kill).toBeGreaterThanOrEqual(KILL_RANGE.min);
      expect(params.kill).toBeLessThanOrEqual(KILL_RANGE.max);
      expect(seedMode).toMatch(/^(center|stripe|spots|web)$/);
    }
  });

  it('rejects obvious candidates that flatten out quickly', () => {
    expect(
      hasSustainedPatternActivity({
        params: {
          feed: 0.07,
          kill: 0.072,
          diffA: 1,
          diffB: 0.5,
        },
        seedMode: 'center',
      }),
    ).toBe(false);
  });

  it('returns visually active candidates for deterministic random sequences', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const pattern = generateRandomParams(createSeededRandom(seed));

      expect
        .soft(hasSustainedPatternActivity(pattern), `seed ${seed} should produce an active pattern`)
        .toBe(true);
    }
  });
});

describe('withFeedKill', () => {
  it('clamps slider input and preserves diffusion parameters', () => {
    const params = withFeedKill(
      {
        feed: 0.03,
        kill: 0.055,
        diffA: 1,
        diffB: 0.5,
      },
      1,
      -1,
    );

    expect(params.feed).toBe(FEED_RANGE.max);
    expect(params.kill).toBe(KILL_RANGE.min);
    expect(params.diffA).toBe(1);
    expect(params.diffB).toBe(0.5);
  });
});
