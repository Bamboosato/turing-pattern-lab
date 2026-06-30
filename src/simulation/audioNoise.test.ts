import { describe, expect, it } from 'vitest';
import {
  applyAudioNoiseDisturbance,
  clampAudioNoiseSensitivityPercent,
  createAudioNoiseSample,
  createAudioNoiseState,
  getAudioNoiseModulatedParams,
  settleAudioNoiseState,
  updateAudioNoiseState,
  type AudioNoiseState,
} from './audioNoise';
import type { SimulationState } from './types';

describe('audio noise analysis', () => {
  it('separates low, mid, and high frequency energy into band samples', () => {
    const frequencyData = new Uint8Array(512);

    frequencyData[3] = 255;
    frequencyData[20] = 180;
    frequencyData[100] = 220;

    const sample = createAudioNoiseSample(frequencyData, 48_000, 1_024);

    expect(sample.volume).toBeGreaterThan(0);
    expect(sample.low).toBeGreaterThan(0);
    expect(sample.mid).toBeGreaterThan(0);
    expect(sample.high).toBeGreaterThan(0);
  });

  it('clamps audio sensitivity to the supported slider range', () => {
    expect(clampAudioNoiseSensitivityPercent(25)).toBe(50);
    expect(clampAudioNoiseSensitivityPercent(100)).toBe(100);
    expect(clampAudioNoiseSensitivityPercent(250)).toBe(200);
    expect(clampAudioNoiseSensitivityPercent(Number.NaN)).toBe(100);
  });

  it('scales response strength with the audio sensitivity setting', () => {
    const sample = {
      volume: 0.38,
      low: 0.35,
      mid: 0.35,
      high: 0.35,
    };
    const low = updateAudioNoiseState(createAudioNoiseState(), sample, 50);
    const normal = updateAudioNoiseState(createAudioNoiseState(), sample, 100);
    const high = updateAudioNoiseState(createAudioNoiseState(), sample, 200);

    expect(low.strength).toBeLessThan(normal.strength);
    expect(normal.strength).toBeLessThan(high.strength);
  });

  it('decays audio response back toward rest when no new sample arrives', () => {
    const active = updateAudioNoiseState(createAudioNoiseState(), {
      volume: 1,
      low: 0.8,
      mid: 0.6,
      high: 0.4,
    });
    const settled = settleAudioNoiseState(active);

    expect(settled.volume).toBeLessThan(active.volume);
    expect(settled.low).toBeLessThan(active.low);
    expect(settled.mid).toBeLessThan(active.mid);
    expect(settled.high).toBeLessThan(active.high);
    expect(settled.strength).toBeLessThan(active.strength);
  });

  it('uses mid frequencies to create a bounded temporary parameter modulation', () => {
    const params = {
      feed: 0.036,
      kill: 0.06,
      diffA: 1,
      diffB: 0.5,
    };
    const noise: AudioNoiseState = {
      volume: 1,
      low: 0,
      mid: 1,
      high: 0,
      strength: 1,
      phase: Math.PI / 4,
    };
    const modulated = getAudioNoiseModulatedParams(params, noise);

    expect(modulated.feed).not.toBe(params.feed);
    expect(modulated.kill).not.toBe(params.kill);
    expect(Math.abs(modulated.feed - params.feed)).toBeLessThanOrEqual(0.0016);
    expect(Math.abs(modulated.kill - params.kill)).toBeLessThanOrEqual(0.0011);
    expect(modulated.diffA).toBe(params.diffA);
    expect(modulated.diffB).toBe(params.diffB);
  });

  it('disturbs the simulation state with low flow and high texture instead of moving the canvas', () => {
    const state = createSmallState();
    const beforeB = Array.from(state.b);
    const affectedCells = applyAudioNoiseDisturbance(state, {
      volume: 1,
      low: 1,
      mid: 0.5,
      high: 1,
      strength: 1,
      phase: 0.8,
    });

    expect(affectedCells).toBeGreaterThan(0);
    expect(Array.from(state.b)).not.toEqual(beforeB);
  });

  it('ignores invalid sample values instead of producing NaN response', () => {
    const state = updateAudioNoiseState(createAudioNoiseState(), {
      volume: Number.NaN,
      low: Number.POSITIVE_INFINITY,
      mid: Number.NEGATIVE_INFINITY,
      high: Number.NaN,
    });

    expect(Number.isNaN(state.volume)).toBe(false);
    expect(Number.isNaN(state.low)).toBe(false);
    expect(Number.isNaN(state.mid)).toBe(false);
    expect(Number.isNaN(state.high)).toBe(false);
    expect(Number.isNaN(state.strength)).toBe(false);
  });
});

function createSmallState(): SimulationState {
  const width = 7;
  const height = 7;
  const cellCount = width * height;
  const a = new Float32Array(cellCount);
  const b = new Float32Array(cellCount);

  a.fill(1);
  b[3 * width + 3] = 1;

  return {
    width,
    height,
    a,
    b,
    nextA: new Float32Array(cellCount),
    nextB: new Float32Array(cellCount),
  };
}
