import type { SimulationState } from './types';

export type MotionShakeSample = {
  x: number | null | undefined;
  y: number | null | undefined;
};

export type MotionShakeState = {
  hasSample: boolean;
  lastX: number;
  lastY: number;
  impulseX: number;
  impulseY: number;
  strength: number;
};

export const MOTION_SHAKE_MAX_IMPULSE = 1;

const MOTION_SHAKE_DEAD_ZONE = 0.28;
const MOTION_SHAKE_GAIN = 0.14;
const MOTION_SHAKE_RESPONSE = 0.42;
const MOTION_SHAKE_DECAY = 0.84;
const MOTION_SHAKE_SNAP_TO_ZERO = 0.015;
const MOTION_SHAKE_MIN_STRENGTH = 0.035;
const MOTION_SHAKE_MAX_SHIFT_CELLS = 8;
const MOTION_SHAKE_BASE_MIX = 0.1;
const MOTION_SHAKE_MIX_GAIN = 0.36;
const MOTION_SHAKE_TURBULENCE = 0.035;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function applyDeadZone(value: number) {
  const magnitude = Math.abs(value);

  if (magnitude < MOTION_SHAKE_DEAD_ZONE) {
    return 0;
  }

  return Math.sign(value) * (magnitude - MOTION_SHAKE_DEAD_ZONE);
}

function snapSmallOffset(value: number) {
  return Math.abs(value) < MOTION_SHAKE_SNAP_TO_ZERO ? 0 : value;
}

function blendValue(current: number, target: number) {
  return snapSmallOffset(current + (target - current) * MOTION_SHAKE_RESPONSE);
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function wrap(value: number, size: number) {
  return (value + size) % size;
}

function resolveShift(impulseX: number, impulseY: number) {
  let shiftX = Math.round(impulseX * MOTION_SHAKE_MAX_SHIFT_CELLS);
  let shiftY = Math.round(impulseY * MOTION_SHAKE_MAX_SHIFT_CELLS);

  if (shiftX === 0 && shiftY === 0) {
    if (Math.abs(impulseX) >= Math.abs(impulseY) && impulseX !== 0) {
      shiftX = Math.sign(impulseX);
    } else if (impulseY !== 0) {
      shiftY = Math.sign(impulseY);
    }
  }

  return { shiftX, shiftY };
}

export function createMotionShakeState(): MotionShakeState {
  return {
    hasSample: false,
    lastX: 0,
    lastY: 0,
    impulseX: 0,
    impulseY: 0,
    strength: 0,
  };
}

export function updateMotionShakeState(
  current: MotionShakeState,
  sample: MotionShakeSample,
): MotionShakeState {
  const x = finiteOrZero(sample.x);
  const y = finiteOrZero(sample.y);

  if (!current.hasSample) {
    return {
      ...current,
      hasSample: true,
      lastX: x,
      lastY: y,
    };
  }

  const jerkX = applyDeadZone(x - current.lastX);
  const jerkY = applyDeadZone(y - current.lastY);
  const targetX = clamp(jerkX * MOTION_SHAKE_GAIN, -MOTION_SHAKE_MAX_IMPULSE, MOTION_SHAKE_MAX_IMPULSE);
  const targetY = clamp(jerkY * MOTION_SHAKE_GAIN, -MOTION_SHAKE_MAX_IMPULSE, MOTION_SHAKE_MAX_IMPULSE);
  const targetStrength = clamp(Math.hypot(targetX, targetY), 0, MOTION_SHAKE_MAX_IMPULSE);
  const impulseX = blendValue(current.impulseX, targetX);
  const impulseY = blendValue(current.impulseY, targetY);

  return {
    hasSample: true,
    lastX: x,
    lastY: y,
    impulseX,
    impulseY,
    strength: blendValue(current.strength, targetStrength),
  };
}

export function settleMotionShakeState(current: MotionShakeState): MotionShakeState {
  return {
    ...current,
    impulseX: snapSmallOffset(current.impulseX * MOTION_SHAKE_DECAY),
    impulseY: snapSmallOffset(current.impulseY * MOTION_SHAKE_DECAY),
    strength: snapSmallOffset(current.strength * MOTION_SHAKE_DECAY),
  };
}

export function applyMotionShakeDisturbance(
  state: SimulationState,
  shake: MotionShakeState,
): number {
  if (shake.strength < MOTION_SHAKE_MIN_STRENGTH) {
    return 0;
  }

  const { shiftX, shiftY } = resolveShift(shake.impulseX, shake.impulseY);

  if (shiftX === 0 && shiftY === 0) {
    return 0;
  }

  const { width, height, a, b, nextA, nextB } = state;
  const mix = clamp(
    MOTION_SHAKE_BASE_MIX + shake.strength * MOTION_SHAKE_MIX_GAIN,
    0,
    0.5,
  );
  const turbulence = shake.strength * MOTION_SHAKE_TURBULENCE;
  const normalX = shiftY === 0 ? 1 : shiftY;
  const normalY = shiftX === 0 ? 1 : -shiftX;
  let affectedCells = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = wrap(y - shiftY, height);

    for (let x = 0; x < width; x += 1) {
      const sourceX = wrap(x - shiftX, width);
      const index = y * width + x;
      const sourceIndex = sourceY * width + sourceX;
      const wave = Math.sin((x * normalX + y * normalY) * 0.19);
      const waveAmount = wave > 0.93 ? turbulence * (wave - 0.93) * 14 : 0;
      const mixedA = a[index] * (1 - mix) + a[sourceIndex] * mix;
      const mixedB = b[index] * (1 - mix) + b[sourceIndex] * mix;

      nextB[index] = clamp01(mixedB + waveAmount * (1 - mixedB));
      nextA[index] = clamp01(mixedA - waveAmount * 0.45 * mixedA);
      affectedCells += 1;
    }
  }

  state.a = nextA;
  state.b = nextB;
  state.nextA = a;
  state.nextB = b;

  return affectedCells;
}
