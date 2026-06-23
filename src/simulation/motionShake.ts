export type MotionShakeSample = {
  x: number | null | undefined;
  y: number | null | undefined;
};

export type MotionShakeState = {
  hasSample: boolean;
  lastX: number;
  lastY: number;
  offsetX: number;
  offsetY: number;
};

export const MOTION_SHAKE_MAX_OFFSET = 18;

const MOTION_SHAKE_DEAD_ZONE = 0.28;
const MOTION_SHAKE_GAIN = 5.2;
const MOTION_SHAKE_RESPONSE = 0.42;
const MOTION_SHAKE_DECAY = 0.84;
const MOTION_SHAKE_SNAP_TO_ZERO = 0.04;

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

function blendOffset(current: number, target: number) {
  return snapSmallOffset(current + (target - current) * MOTION_SHAKE_RESPONSE);
}

export function createMotionShakeState(): MotionShakeState {
  return {
    hasSample: false,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
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
  const targetX = clamp(jerkX * MOTION_SHAKE_GAIN, -MOTION_SHAKE_MAX_OFFSET, MOTION_SHAKE_MAX_OFFSET);
  const targetY = clamp(jerkY * MOTION_SHAKE_GAIN, -MOTION_SHAKE_MAX_OFFSET, MOTION_SHAKE_MAX_OFFSET);

  return {
    hasSample: true,
    lastX: x,
    lastY: y,
    offsetX: blendOffset(current.offsetX, targetX),
    offsetY: blendOffset(current.offsetY, targetY),
  };
}

export function settleMotionShakeState(current: MotionShakeState): MotionShakeState {
  return {
    ...current,
    offsetX: snapSmallOffset(current.offsetX * MOTION_SHAKE_DECAY),
    offsetY: snapSmallOffset(current.offsetY * MOTION_SHAKE_DECAY),
  };
}
