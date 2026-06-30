import { injectActivator } from './brush';
import type { ReactionDiffusionParams, SimulationState } from './types';

type AudioFrequencyData = Uint8Array<ArrayBufferLike>;

export type AudioNoiseSample = {
  volume: number;
  low: number;
  mid: number;
  high: number;
};

export type AudioNoiseState = AudioNoiseSample & {
  strength: number;
  phase: number;
};

export const AUDIO_NOISE_SENSITIVITY_RANGE = {
  min: 50,
  max: 200,
  step: 10,
} as const;

const TWO_PI = Math.PI * 2;
const AUDIO_NOISE_DEAD_ZONE = 0.08;
const AUDIO_NOISE_RESPONSE = 0.34;
const AUDIO_NOISE_DECAY = 0.86;
const AUDIO_NOISE_SNAP_TO_ZERO = 0.012;
const AUDIO_NOISE_MIN_STRENGTH = 0.025;
const AUDIO_NOISE_MAX_LOW_SHIFT_CELLS = 6;
const AUDIO_NOISE_BASE_LOW_MIX = 0.018;
const AUDIO_NOISE_LOW_MIX_GAIN = 0.12;
const AUDIO_NOISE_MID_FEED_SHIFT = 0.0016;
const AUDIO_NOISE_MID_KILL_SHIFT = 0.0011;
const AUDIO_NOISE_FEED_LIMITS = {
  min: 0.008,
  max: 0.08,
} as const;
const AUDIO_NOISE_KILL_LIMITS = {
  min: 0.035,
  max: 0.085,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function applyNoiseFloor(value: number, sensitivityMultiplier: number) {
  const scaled = clamp01(finiteOrZero(value) * sensitivityMultiplier);

  if (scaled <= AUDIO_NOISE_DEAD_ZONE) {
    return 0;
  }

  return (scaled - AUDIO_NOISE_DEAD_ZONE) / (1 - AUDIO_NOISE_DEAD_ZONE);
}

function snapSmallValue(value: number) {
  return Math.abs(value) < AUDIO_NOISE_SNAP_TO_ZERO ? 0 : value;
}

function blendValue(current: number, target: number) {
  return snapSmallValue(current + (target - current) * AUDIO_NOISE_RESPONSE);
}

function wrap(value: number, size: number) {
  return (value + size) % size;
}

function fractional(value: number) {
  return value - Math.floor(value);
}

export function createAudioNoiseState(): AudioNoiseState {
  return {
    volume: 0,
    low: 0,
    mid: 0,
    high: 0,
    strength: 0,
    phase: 0,
  };
}

export function clampAudioNoiseSensitivityPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return clamp(
    value,
    AUDIO_NOISE_SENSITIVITY_RANGE.min,
    AUDIO_NOISE_SENSITIVITY_RANGE.max,
  );
}

export function createAudioNoiseSample(
  frequencyData: AudioFrequencyData,
  sampleRate: number,
  fftSize: number,
): AudioNoiseSample {
  return {
    volume: calculateFrequencyRms(frequencyData),
    low: averageFrequencyBand(frequencyData, sampleRate, fftSize, 20, 250),
    mid: averageFrequencyBand(frequencyData, sampleRate, fftSize, 250, 2_000),
    high: averageFrequencyBand(frequencyData, sampleRate, fftSize, 2_000, 8_000),
  };
}

export function updateAudioNoiseState(
  current: AudioNoiseState,
  sample: AudioNoiseSample,
  sensitivityPercent = 100,
): AudioNoiseState {
  const sensitivityMultiplier = clampAudioNoiseSensitivityPercent(sensitivityPercent) / 100;
  const volume = applyNoiseFloor(sample.volume, sensitivityMultiplier);
  const low = applyNoiseFloor(sample.low, sensitivityMultiplier);
  const mid = applyNoiseFloor(sample.mid, sensitivityMultiplier);
  const high = applyNoiseFloor(sample.high, sensitivityMultiplier);
  const spectralEnergy = (low + mid + high) / 3;
  const targetStrength = clamp01(
    volume * (0.52 + spectralEnergy * 0.48) * sensitivityMultiplier,
  );

  return {
    volume: blendValue(current.volume, volume),
    low: blendValue(current.low, low),
    mid: blendValue(current.mid, mid),
    high: blendValue(current.high, high),
    strength: blendValue(current.strength, targetStrength),
    phase:
      (current.phase +
        0.055 +
        targetStrength * 0.16 +
        low * 0.08 +
        mid * 0.05 +
        high * 0.03) %
      TWO_PI,
  };
}

export function settleAudioNoiseState(current: AudioNoiseState): AudioNoiseState {
  return {
    volume: snapSmallValue(current.volume * AUDIO_NOISE_DECAY),
    low: snapSmallValue(current.low * AUDIO_NOISE_DECAY),
    mid: snapSmallValue(current.mid * AUDIO_NOISE_DECAY),
    high: snapSmallValue(current.high * AUDIO_NOISE_DECAY),
    strength: snapSmallValue(current.strength * AUDIO_NOISE_DECAY),
    phase: (current.phase + 0.035) % TWO_PI,
  };
}

export function getAudioNoiseModulatedParams(
  params: ReactionDiffusionParams,
  noise: AudioNoiseState,
): ReactionDiffusionParams {
  if (noise.strength < AUDIO_NOISE_MIN_STRENGTH || noise.mid <= 0) {
    return params;
  }

  const midEnvelope = clamp01(noise.mid * noise.strength);
  const wave = Math.sin(noise.phase * 1.7);
  const feedShift = wave * midEnvelope * AUDIO_NOISE_MID_FEED_SHIFT;
  const killShift = -wave * midEnvelope * AUDIO_NOISE_MID_KILL_SHIFT;

  return {
    ...params,
    feed: clamp(params.feed + feedShift, AUDIO_NOISE_FEED_LIMITS.min, AUDIO_NOISE_FEED_LIMITS.max),
    kill: clamp(params.kill + killShift, AUDIO_NOISE_KILL_LIMITS.min, AUDIO_NOISE_KILL_LIMITS.max),
  };
}

export function applyAudioNoiseDisturbance(
  state: SimulationState,
  noise: AudioNoiseState,
): number {
  if (noise.strength < AUDIO_NOISE_MIN_STRENGTH) {
    return 0;
  }

  return applyLowBandFlow(state, noise) + applyHighBandTexture(state, noise);
}

function calculateFrequencyRms(frequencyData: AudioFrequencyData) {
  if (frequencyData.length === 0) {
    return 0;
  }

  let sumSquares = 0;

  for (const value of frequencyData) {
    const normalized = value / 255;
    sumSquares += normalized * normalized;
  }

  return clamp01(Math.sqrt(sumSquares / frequencyData.length));
}

function averageFrequencyBand(
  frequencyData: AudioFrequencyData,
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number,
) {
  if (frequencyData.length === 0 || sampleRate <= 0 || fftSize <= 0) {
    return 0;
  }

  const binFrequency = sampleRate / fftSize;
  const nyquist = sampleRate / 2;
  const bandMin = clamp(minHz, 0, nyquist);
  const bandMax = clamp(maxHz, bandMin, nyquist);
  const startIndex = clamp(Math.floor(bandMin / binFrequency), 0, frequencyData.length - 1);
  const endIndex = clamp(Math.ceil(bandMax / binFrequency), startIndex, frequencyData.length - 1);
  let total = 0;
  let count = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    total += frequencyData[index];
    count += 1;
  }

  return count === 0 ? 0 : clamp01(total / count / 255);
}

function applyLowBandFlow(state: SimulationState, noise: AudioNoiseState) {
  const lowEnvelope = clamp01(noise.low * noise.strength);

  if (lowEnvelope <= 0) {
    return 0;
  }

  const { width, height, a, b, nextA, nextB } = state;
  const shiftMagnitude = Math.max(
    1,
    Math.round(lowEnvelope * AUDIO_NOISE_MAX_LOW_SHIFT_CELLS),
  );
  const shiftX = Math.round(Math.cos(noise.phase) * shiftMagnitude);
  const shiftY = Math.round(Math.sin(noise.phase * 0.83 + noise.mid) * shiftMagnitude);
  const mix = clamp(
    AUDIO_NOISE_BASE_LOW_MIX + lowEnvelope * AUDIO_NOISE_LOW_MIX_GAIN,
    0,
    0.16,
  );
  const waveGain = noise.mid * noise.strength * 0.018;
  let affectedCells = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = wrap(y - shiftY, height);

    for (let x = 0; x < width; x += 1) {
      const sourceX = wrap(x - shiftX, width);
      const index = y * width + x;
      const sourceIndex = sourceY * width + sourceX;
      const wave = Math.sin(x * 0.17 + y * 0.11 + noise.phase * 2.3);
      const waveAmount = wave > 0.94 ? waveGain * (wave - 0.94) * 10 : 0;
      const mixedA = a[index] * (1 - mix) + a[sourceIndex] * mix;
      const mixedB = b[index] * (1 - mix) + b[sourceIndex] * mix;

      nextA[index] = clamp01(mixedA - waveAmount * 0.35 * mixedA);
      nextB[index] = clamp01(mixedB + waveAmount * (1 - mixedB));
      affectedCells += 1;
    }
  }

  state.a = nextA;
  state.b = nextB;
  state.nextA = a;
  state.nextB = b;

  return affectedCells;
}

function applyHighBandTexture(state: SimulationState, noise: AudioNoiseState) {
  const highEnvelope = clamp01(noise.high * noise.strength);

  if (highEnvelope <= 0) {
    return 0;
  }

  const pointBudget = Math.min(
    96,
    Math.max(1, Math.round(state.width * state.height * 0.00042 * highEnvelope)),
  );
  const radius = 1.1 + noise.high * 1.9;
  const strength = clamp(0.025 + highEnvelope * 0.18, 0, 0.2);
  let affectedCells = 0;

  for (let index = 0; index < pointBudget; index += 1) {
    const seedX = fractional(Math.sin((index + 1) * 12.9898 + noise.phase * 78.233) * 43_758.5453);
    const seedY = fractional(Math.sin((index + 1) * 39.3468 + noise.phase * 22.749) * 24_634.6345);

    affectedCells += injectActivator(state, seedX * state.width, seedY * state.height, {
      radius,
      strength,
    });
  }

  return affectedCells;
}
