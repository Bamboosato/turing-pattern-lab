export type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center' | 'unknown';
export type EyeState = 'open' | 'closed';

export type EyeInteractionState = {
  eyeState: EyeState;
  eyesClosedMs: number;
  longClosePending: boolean;
};

export type EyeEvent = 'none' | 'blink' | 'longClose';

export const LONG_EYE_CLOSE_MS = 1200;
export const STIMULUS_POSITIONS: Record<Exclude<GazeDirection, 'unknown'>, { x: number; y: number }> = {
  up: { x: 0.5, y: 0.2 },
  down: { x: 0.5, y: 0.8 },
  left: { x: 0.2, y: 0.5 },
  right: { x: 0.8, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
};

export function createEyeInteractionState(): EyeInteractionState {
  return { eyeState: 'open', eyesClosedMs: 0, longClosePending: false };
}

export function updateEyeInteraction(
  state: EyeInteractionState,
  eyesAreClosed: boolean,
  deltaMs: number,
): { state: EyeInteractionState; event: EyeEvent } {
  const dt = Math.max(0, deltaMs);

  if (eyesAreClosed) {
    const eyesClosedMs = state.eyeState === 'closed' ? state.eyesClosedMs + dt : dt;
    return {
      state: {
        eyeState: 'closed',
        eyesClosedMs,
        longClosePending: state.longClosePending || eyesClosedMs >= LONG_EYE_CLOSE_MS,
      },
      event: 'none',
    };
  }

  if (state.eyeState === 'open') {
    return { state: { ...state, eyesClosedMs: 0 }, event: 'none' };
  }

  const event: EyeEvent = state.longClosePending ? 'longClose' : 'blink';
  return { state: createEyeInteractionState(), event };
}

export function normalizeGazeDirection(direction: GazeDirection): Exclude<GazeDirection, 'unknown'> {
  return direction === 'unknown' ? 'center' : direction;
}

export type NormalizedGaze = { x: number; y: number };
export type FacePoint = { x: number; y: number };

export function classifyGaze(
  gaze: NormalizedGaze,
  thresholds: { horizontal?: number; vertical?: number } = {},
): GazeDirection {
  // Iris movement occupies only a small portion of the eye contour. Wider
  // thresholds make real gaze changes stay in the center region.
  const horizontal = thresholds.horizontal ?? 0.1;
  const vertical = thresholds.vertical ?? 0.12;
  const x = Math.max(0, Math.min(1, gaze.x));
  const y = Math.max(0, Math.min(1, gaze.y));

  if (x <= 0.5 - horizontal) return 'left';
  if (x >= 0.5 + horizontal) return 'right';
  if (y <= 0.5 - vertical) return 'up';
  if (y >= 0.5 + vertical) return 'down';
  return 'center';
}

function normalizeBetween(value: number, first: number, second: number): number | null {
  const minimum = Math.min(first, second);
  const maximum = Math.max(first, second);
  const span = maximum - minimum;
  if (span < 0.0001) return null;
  return Math.max(0, Math.min(1, (value - minimum) / span));
}

/**
 * Converts MediaPipe iris points into eye-local normalized coordinates.
 * Face-relative coordinates are required: whole-image iris coordinates mostly
 * describe head position, rather than where the user is looking.
 */
export function getGazeFromFaceLandmarks(points: readonly FacePoint[]): NormalizedGaze | null {
  const required = [33, 133, 159, 145, 263, 362, 386, 374, 468, 473];
  if (required.some((index) => !points[index])) return null;

  const leftX = normalizeBetween(points[468].x, points[33].x, points[133].x);
  const rightX = normalizeBetween(points[473].x, points[263].x, points[362].x);
  const leftY = normalizeBetween(points[468].y, points[159].y, points[145].y);
  const rightY = normalizeBetween(points[473].y, points[386].y, points[374].y);
  if ([leftX, rightX, leftY, rightY].some((value) => value === null)) return null;

  return {
    x: (leftX! + rightX!) / 2,
    // Camera landmarks use the opposite vertical direction to the intended
    // interaction: looking down moves the iris toward the lower eyelid.
    y: 1 - (leftY! + rightY!) / 2,
  };
}

export type AttentionDirection = Exclude<GazeDirection, 'unknown'>;
export type BaselineStatus = 'collecting' | 'provisional' | 'stable';

export type FaceInteractionState = {
  isFaceDetected: boolean;
  baselineStatus: BaselineStatus;
  baselineConfidence: number;
  eyeSignalX: number;
  eyeSignalY: number;
  eyeConfidence: number;
  headSignalX: number;
  headSignalY: number;
  headConfidence: number;
  yaw: number;
  pitch: number;
  attentionX: number;
  attentionY: number;
  attentionDirection: AttentionDirection;
  isBlinking: boolean;
  areEyesClosed: boolean;
  eyeBaselineX: number;
  eyeBaselineY: number;
  headBaselineX: number;
  headBaselineY: number;
  baselineOriginX: number;
  baselineOriginY: number;
  headBaselineOriginX: number;
  headBaselineOriginY: number;
  stableCenterMs: number;
  pendingDirection: AttentionDirection;
  pendingDirectionMs: number;
  lastTimestampMs: number;
};

export type FaceInteractionInput = {
  timestampMs: number;
  isFaceDetected: boolean;
  eyeSignal?: NormalizedGaze | null;
  eyeConfidence?: number;
  headSignal?: { x: number; y: number; yaw: number; pitch: number } | null;
  headConfidence?: number;
  isBlinking: boolean;
  areEyesClosed: boolean;
  stimulusCooldown?: boolean;
};

const BASELINE_COLLECT_MS = 800;
const BASELINE_STABLE_MS = 3000;
const DIRECTION_HOLD_MS = 150;
const MAX_BASELINE_DRIFT = 0.12;
const MAX_BASELINE_STEP = 0.002;

export function createFaceInteractionState(): FaceInteractionState {
  return {
    isFaceDetected: false,
    baselineStatus: 'collecting',
    baselineConfidence: 0,
    eyeSignalX: 0.5,
    eyeSignalY: 0.5,
    eyeConfidence: 0,
    headSignalX: 0,
    headSignalY: 0,
    headConfidence: 0,
    yaw: 0,
    pitch: 0,
    attentionX: 0,
    attentionY: 0,
    attentionDirection: 'center',
    isBlinking: false,
    areEyesClosed: false,
    eyeBaselineX: 0.5,
    eyeBaselineY: 0.5,
    headBaselineX: 0,
    headBaselineY: 0,
    baselineOriginX: 0.5,
    baselineOriginY: 0.5,
    headBaselineOriginX: 0,
    headBaselineOriginY: 0,
    stableCenterMs: 0,
    pendingDirection: 'center',
    pendingDirectionMs: 0,
    lastTimestampMs: 0,
  };
}

export function updateFaceInteractionState(
  state: FaceInteractionState,
  input: FaceInteractionInput,
): FaceInteractionState {
  const dt = Math.min(250, Math.max(0, input.timestampMs - state.lastTimestampMs || 16));
  if (!input.isFaceDetected) {
    return { ...state, isFaceDetected: false, eyeConfidence: 0, headConfidence: 0, lastTimestampMs: input.timestampMs };
  }

  const eyeConfidence = input.isBlinking || input.areEyesClosed ? 0 : input.eyeConfidence ?? (input.eyeSignal ? 1 : 0);
  const headConfidence = input.headConfidence ?? (input.headSignal ? 1 : 0);
  const eyeSignal = input.eyeSignal ?? { x: state.eyeSignalX, y: state.eyeSignalY };
  const headSignal = input.headSignal ?? { x: state.headSignalX, y: state.headSignalY, yaw: state.yaw, pitch: state.pitch };
  // A phone's front camera is normally above the Canvas center. Before a
  // baseline exists, absolute pitch therefore cannot define "forward". Use
  // yaw plus temporal stability to establish the first baseline; afterwards
  // enforce frontal limits relative to that learned baseline.
  const headRelativeX = headSignal.x - state.headBaselineX;
  const headRelativeY = headSignal.y - state.headBaselineY;
  const frontal = state.baselineStatus === 'collecting'
    ? Math.abs(headSignal.x) < 0.35
    : Math.abs(headRelativeX) < 0.28 && Math.abs(headRelativeY) < 0.28;
  const eyeMovement = Math.hypot(eyeSignal.x - state.eyeSignalX, eyeSignal.y - state.eyeSignalY);
  const headMovement = Math.hypot(headSignal.x - state.headSignalX, headSignal.y - state.headSignalY);
  const stableMovement = state.baselineStatus === 'collecting' && state.stableCenterMs === 0
    ? true
    : eyeMovement < 0.06 && headMovement < 0.12;
  const initialCandidate = eyeConfidence >= 0.6 && headConfidence >= 0.6 && stableMovement && !input.stimulusCooldown;
  const stableCandidate = initialCandidate && frontal;
  const stableCenterMs = stableCandidate ? state.stableCenterMs + dt : 0;

  let eyeBaselineX = state.eyeBaselineX;
  let eyeBaselineY = state.eyeBaselineY;
  let headBaselineX = state.headBaselineX;
  let headBaselineY = state.headBaselineY;
  let baselineOriginX = state.baselineOriginX;
  let baselineOriginY = state.baselineOriginY;
  let headBaselineOriginX = state.headBaselineOriginX;
  let headBaselineOriginY = state.headBaselineOriginY;
  let baselineStatus = state.baselineStatus;

  if (baselineStatus === 'collecting' && stableCandidate) {
    if (state.stableCenterMs === 0) {
      eyeBaselineX = eyeSignal.x;
      eyeBaselineY = eyeSignal.y;
      headBaselineX = headSignal.x;
      headBaselineY = headSignal.y;
      baselineOriginX = eyeSignal.x;
      baselineOriginY = eyeSignal.y;
      headBaselineOriginX = headSignal.x;
      headBaselineOriginY = headSignal.y;
    } else {
      const collectionAlpha = 0.08;
      eyeBaselineX += (eyeSignal.x - eyeBaselineX) * collectionAlpha;
      eyeBaselineY += (eyeSignal.y - eyeBaselineY) * collectionAlpha;
      headBaselineX += (headSignal.x - headBaselineX) * collectionAlpha;
      headBaselineY += (headSignal.y - headBaselineY) * collectionAlpha;
    }
    if (stableCenterMs >= BASELINE_COLLECT_MS) baselineStatus = 'provisional';
  }

  const eyeOffsetX = clampSigned((eyeSignal.x - eyeBaselineX) * 3.5);
  const eyeOffsetY = clampSigned((eyeSignal.y - eyeBaselineY) * 3.5);
  const headOffsetX = clampSigned(headSignal.x - headBaselineX);
  const headOffsetY = clampSigned(headSignal.y - headBaselineY);
  const faceIsNearFront = Math.hypot(headOffsetX, headOffsetY) < 0.18;
  const useEyeWeight = baselineStatus === 'collecting'
    ? 0
    : (faceIsNearFront ? 0.7 : 0.4) * eyeConfidence;
  const useHeadWeight = (faceIsNearFront ? 0.3 : 0.6) * headConfidence
    + (baselineStatus === 'collecting' ? 0.4 : 0);
  const weightTotal = useEyeWeight + useHeadWeight || 1;
  const rawAttentionX = (eyeOffsetX * useEyeWeight + headOffsetX * useHeadWeight) / weightTotal;
  const rawAttentionY = (eyeOffsetY * useEyeWeight + headOffsetY * useHeadWeight) / weightTotal;
  const smoothing = 1 - Math.exp(-dt / 120);
  const attentionX = state.attentionX + (rawAttentionX - state.attentionX) * smoothing;
  const attentionY = state.attentionY + (rawAttentionY - state.attentionY) * smoothing;
  const candidateDirection = classifyAttention(attentionX, attentionY);
  const pendingDirectionMs = candidateDirection === state.pendingDirection ? state.pendingDirectionMs + dt : dt;
  const pendingDirection = candidateDirection;
  const attentionDirection = pendingDirectionMs >= DIRECTION_HOLD_MS ? candidateDirection : state.attentionDirection;
  const canUpdateBaseline = stableCandidate && attentionDirection === 'center' && baselineStatus !== 'collecting';

  if (canUpdateBaseline) {
    const alpha = baselineStatus === 'provisional' ? 0.018 : 0.003;
    eyeBaselineX = boundedBaselineUpdate(eyeBaselineX, eyeSignal.x, baselineOriginX, alpha);
    eyeBaselineY = boundedBaselineUpdate(
      eyeBaselineY,
      eyeSignal.y,
      baselineOriginY,
      alpha,
    );
    headBaselineX = boundedBaselineUpdate(headBaselineX, headSignal.x, headBaselineOriginX, alpha);
    headBaselineY = boundedBaselineUpdate(headBaselineY, headSignal.y, headBaselineOriginY, alpha);
  }
  if (baselineStatus === 'provisional' && stableCenterMs >= BASELINE_STABLE_MS) baselineStatus = 'stable';

  return {
    ...state,
    isFaceDetected: true,
    baselineStatus,
    baselineConfidence: Math.min(1, stableCenterMs / BASELINE_STABLE_MS) * Math.min(eyeConfidence, headConfidence),
    eyeSignalX: eyeSignal.x,
    eyeSignalY: eyeSignal.y,
    eyeConfidence,
    headSignalX: headSignal.x,
    headSignalY: headSignal.y,
    headConfidence,
    yaw: headSignal.yaw,
    pitch: headSignal.pitch,
    attentionX,
    attentionY,
    attentionDirection,
    isBlinking: input.isBlinking,
    areEyesClosed: input.areEyesClosed,
    eyeBaselineX,
    eyeBaselineY,
    headBaselineX,
    headBaselineY,
    baselineOriginX,
    baselineOriginY,
    headBaselineOriginX,
    headBaselineOriginY,
    stableCenterMs,
    pendingDirection,
    pendingDirectionMs,
    lastTimestampMs: input.timestampMs,
  };
}

export function getHeadSignalFromMatrix(data: readonly number[] | undefined): { x: number; y: number; yaw: number; pitch: number } | null {
  if (!data || data.length < 16) return null;
  // Face Landmarker returns a 4x4 affine matrix. The rotation component is
  // interpreted in row-major order and then normalized to user-centric axes.
  const pitch = Math.atan2(-data[9], Math.hypot(data[10], data[11]));
  const yaw = Math.atan2(data[8], data[10]);
  return {
    x: clampSigned(-yaw / 0.55),
    y: clampSigned(pitch / 0.42),
    yaw,
    pitch,
  };
}

function classifyAttention(x: number, y: number): AttentionDirection {
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  if (Math.max(horizontal, vertical) < 0.16) return 'center';
  if (horizontal >= vertical) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

function boundedBaselineUpdate(baseline: number, detected: number, origin: number, alpha: number): number {
  const desired = baseline + (detected - baseline) * alpha;
  const stepped = baseline + Math.max(-MAX_BASELINE_STEP, Math.min(MAX_BASELINE_STEP, desired - baseline));
  return Math.max(origin - MAX_BASELINE_DRIFT, Math.min(origin + MAX_BASELINE_DRIFT, stepped));
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
