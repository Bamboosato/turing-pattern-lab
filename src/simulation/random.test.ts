import { describe, expect, it } from 'vitest';
import { FEED_RANGE, KILL_RANGE, generateRandomParams, withFeedKill } from './random';

describe('generateRandomParams', () => {
  it('returns feed and kill values inside the supported slider ranges', () => {
    for (let index = 0; index < 100; index += 1) {
      const { params, seedMode } = generateRandomParams();

      expect(params.feed).toBeGreaterThanOrEqual(FEED_RANGE.min);
      expect(params.feed).toBeLessThanOrEqual(FEED_RANGE.max);
      expect(params.kill).toBeGreaterThanOrEqual(KILL_RANGE.min);
      expect(params.kill).toBeLessThanOrEqual(KILL_RANGE.max);
      expect(seedMode).toMatch(/^(center|stripe|spots|web|noise)$/);
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
