import { describe, expect, it } from 'vitest';
import {
  createEyeInteractionState,
  classifyGaze,
  createFaceInteractionState,
  getHeadSignalFromMatrix,
  getGazeFromFaceLandmarks,
  LONG_EYE_CLOSE_MS,
  normalizeGazeDirection,
  STIMULUS_POSITIONS,
  updateEyeInteraction,
  updateFaceInteractionState,
  type FaceInteractionState,
} from './faceInteraction';

describe('face interaction eye state', () => {
  it('fires one blink when a short closure returns to open', () => {
    let state = createEyeInteractionState();
    ({ state } = updateEyeInteraction(state, true, 100));
    const result = updateEyeInteraction(state, false, 16);
    expect(result.event).toBe('blink');
    expect(result.state.eyeState).toBe('open');
  });

  it('fires longClose only when a long closure returns to open', () => {
    let state = createEyeInteractionState();
    ({ state } = updateEyeInteraction(state, true, LONG_EYE_CLOSE_MS));
    expect(updateEyeInteraction(state, true, 100).event).toBe('none');
    const result = updateEyeInteraction(state, false, 16);
    expect(result.event).toBe('longClose');
  });

  it('maps unknown gaze to center and exposes normalized stimulus positions', () => {
    expect(normalizeGazeDirection('unknown')).toBe('center');
    expect(STIMULUS_POSITIONS.left).toEqual({ x: 0.2, y: 0.5 });
  });

  it('classifies cardinal directions with center thresholds', () => {
    expect(classifyGaze({ x: 0.1, y: 0.5 })).toBe('left');
    expect(classifyGaze({ x: 0.9, y: 0.5 })).toBe('right');
    expect(classifyGaze({ x: 0.5, y: 0.1 })).toBe('up');
    expect(classifyGaze({ x: 0.5, y: 0.9 })).toBe('down');
    expect(classifyGaze({ x: 0.5, y: 0.5 })).toBe('center');
  });

  it('uses sensitive defaults appropriate for eye-local iris movement', () => {
    expect(classifyGaze({ x: 0.38, y: 0.5 })).toBe('left');
    expect(classifyGaze({ x: 0.62, y: 0.5 })).toBe('right');
    expect(classifyGaze({ x: 0.5, y: 0.36 })).toBe('up');
    expect(classifyGaze({ x: 0.5, y: 0.64 })).toBe('down');
  });


  it('uses iris coordinates relative to each eye rather than the full camera frame', () => {
    const landmarks = Array.from({ length: 474 }, () => ({ x: 0, y: 0 }));
    Object.assign(landmarks, {
      33: { x: 0.2, y: 0.5 }, 133: { x: 0.4, y: 0.5 }, 159: { x: 0.3, y: 0.4 }, 145: { x: 0.3, y: 0.6 },
      263: { x: 0.6, y: 0.5 }, 362: { x: 0.8, y: 0.5 }, 386: { x: 0.7, y: 0.4 }, 374: { x: 0.7, y: 0.6 },
      468: { x: 0.22, y: 0.5 }, 473: { x: 0.62, y: 0.5 },
    });
    expect(getGazeFromFaceLandmarks(landmarks)).toEqual({ x: 0.1, y: 0.5 });
  });

  it('inverts eye-local vertical coordinates for the interaction direction', () => {
    const landmarks = Array.from({ length: 474 }, () => ({ x: 0, y: 0 }));
    Object.assign(landmarks, {
      33: { x: 0.2, y: 0.5 }, 133: { x: 0.4, y: 0.5 }, 159: { x: 0.3, y: 0.4 }, 145: { x: 0.3, y: 0.6 },
      263: { x: 0.6, y: 0.5 }, 362: { x: 0.8, y: 0.5 }, 386: { x: 0.7, y: 0.4 }, 374: { x: 0.7, y: 0.6 },
      468: { x: 0.3, y: 0.58 }, 473: { x: 0.7, y: 0.58 },
    });
    expect(getGazeFromFaceLandmarks(landmarks)?.y).toBeCloseTo(0.1);
  });

  it('establishes a provisional baseline only after stable open-eye frames', () => {
    let state = createFaceInteractionState();
    for (let time = 100; time <= 900; time += 100) {
      state = updateFaceInteractionState(state, {
        timestampMs: time, isFaceDetected: true, eyeSignal: { x: 0.5, y: 0.5 },
        headSignal: { x: 0, y: 0, yaw: 0, pitch: 0 }, isBlinking: false, areEyesClosed: false,
      });
    }
    expect(state.baselineStatus).toBe('provisional');
    expect(state.eyeBaselineY).toBeCloseTo(0.5);
  });

  it('can establish the initial baseline with a stable phone-height pitch', () => {
    let state = createFaceInteractionState();
    for (let time = 100; time <= 900; time += 100) {
      state = updateFaceInteractionState(state, {
        timestampMs: time, isFaceDetected: true, eyeSignal: { x: 0.5, y: 0.5 },
        headSignal: { x: 0, y: 0.8, yaw: 0, pitch: 0.34 }, isBlinking: false, areEyesClosed: false,
      });
    }
    expect(state.baselineStatus).toBe('provisional');
    expect(state.headBaselineY).toBeCloseTo(0.8);
    expect(state.headBaselineOriginY).toBeCloseTo(0.8);
  });

  it('does not update the baseline while an attention direction is held', () => {
    const state = { ...createFaceInteractionState(), baselineStatus: 'stable' as const, eyeBaselineX: 0.5 };
    const next = updateFaceInteractionState(state, {
      timestampMs: 200, isFaceDetected: true, eyeSignal: { x: 0.8, y: 0.5 },
      headSignal: { x: 0.5, y: 0, yaw: 0.3, pitch: 0 }, isBlinking: false, areEyesClosed: false,
    });
    expect(next.eyeBaselineX).toBe(0.5);
  });

  it('normalizes a face matrix into user-centric head signals', () => {
    const result = getHeadSignalFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0.2, 0, 1, 0, 0, 0, 0, 1]);
    expect(result?.x).toBeLessThan(0);
  });

  it('maps positive face pitch to the canvas-down direction', () => {
    const result = getHeadSignalFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, -0.2, 1, 0, 0, 0, 0, 1]);
    expect(result?.y).toBeGreaterThan(0);
  });

  it('prioritizes an upward eye movement while the face remains forward', () => {
    let state: FaceInteractionState = {
      ...createFaceInteractionState(),
      baselineStatus: 'stable' as const,
      eyeBaselineX: 0.5,
      eyeBaselineY: 0.5,
      headBaselineX: 0,
      headBaselineY: 0,
      eyeSignalX: 0.5,
      eyeSignalY: 0.5,
    };
    for (let time = 100; time <= 500; time += 100) {
      state = updateFaceInteractionState(state, {
        timestampMs: time, isFaceDetected: true, eyeSignal: { x: 0.5, y: 0.4 },
        headSignal: { x: 0, y: 0, yaw: 0, pitch: 0 }, isBlinking: false, areEyesClosed: false,
      });
    }
    expect(state.attentionDirection).toBe('up');
  });
});
