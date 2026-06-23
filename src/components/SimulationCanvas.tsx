import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { injectActivator } from '../simulation/brush';
import { createSimulationState, stepSimulation } from '../simulation/grayScott';
import {
  applyMotionShakeDisturbance,
  createMotionShakeState,
  settleMotionShakeState,
  updateMotionShakeState,
  type MotionShakeSample,
} from '../simulation/motionShake';
import { writePatternImageData } from '../simulation/render';
import type { SimulationSize } from '../simulation/size';
import type { ReactionDiffusionParams, SeedMode, SimulationState } from '../simulation/types';

const STEPS_PER_FRAME = 3;
const BRUSH_STRENGTH = 0.58;
const MOUSE_FALLBACK_IGNORE_MS = 450;

type BrushPoint = {
  x: number;
  y: number;
};

type SimulationCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  params: ReactionDiffusionParams;
  isPaused: boolean;
  isMotionShakeActive: boolean;
  motionSampleRef: RefObject<MotionShakeSample | null>;
  resetKey: number;
  seedMode: SeedMode;
  simulationSize: SimulationSize;
};

export function SimulationCanvas({
  canvasRef,
  params,
  isPaused,
  isMotionShakeActive,
  motionSampleRef,
  resetKey,
  seedMode,
  simulationSize,
}: SimulationCanvasProps) {
  const paramsRef = useRef(params);
  const pausedRef = useRef(isPaused);
  const motionShakeActiveRef = useRef(isMotionShakeActive);
  const motionShakeRef = useRef(createMotionShakeState());
  const stateRef = useRef<SimulationState | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const isMousePaintingRef = useRef(false);
  const lastBrushPointRef = useRef<BrushPoint | null>(null);
  const lastPointerInputAtRef = useRef(0);
  const lastBrushInputAtRef = useRef(0);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    motionShakeActiveRef.current = isMotionShakeActive;

    if (!isMotionShakeActive) {
      motionSampleRef.current = null;
      motionShakeRef.current = createMotionShakeState();
    }
  }, [isMotionShakeActive, motionSampleRef]);

  const getBrushPoint = useCallback(
    (clientX: number, clientY: number): BrushPoint | null => {
      const canvas = canvasRef.current;
      const state = stateRef.current;

      if (!canvas || !state) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const x = ((clientX - rect.left) / rect.width) * state.width;
      const y = ((clientY - rect.top) / rect.height) * state.height;

      if (x < 0 || x >= state.width || y < 0 || y >= state.height) {
        return null;
      }

      return { x, y };
    },
    [canvasRef],
  );

  const paintBrushStroke = useCallback((from: BrushPoint | null, to: BrushPoint) => {
    const state = stateRef.current;

    if (!state) {
      return;
    }

    const radius = Math.max(5, Math.round(Math.min(state.width, state.height) * 0.028));
    const spacing = Math.max(1, radius * 0.45);

    if (!from) {
      injectActivator(state, to.x, to.y, { radius, strength: BRUSH_STRENGTH });
      lastBrushInputAtRef.current = Date.now();
      return;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      injectActivator(state, from.x + dx * progress, from.y + dy * progress, {
        radius,
        strength: BRUSH_STRENGTH,
      });
    }

    lastBrushInputAtRef.current = Date.now();
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const point = getBrushPoint(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      event.preventDefault();
      lastPointerInputAtRef.current = Date.now();
      activePointerIdRef.current = event.pointerId;
      lastBrushPointRef.current = point;
      event.currentTarget.setPointerCapture(event.pointerId);
      paintBrushStroke(null, point);
    },
    [getBrushPoint, paintBrushStroke],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      const point = getBrushPoint(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      event.preventDefault();
      lastPointerInputAtRef.current = Date.now();
      paintBrushStroke(lastBrushPointRef.current, point);
      lastBrushPointRef.current = point;
    },
    [getBrushPoint, paintBrushStroke],
  );

  const handlePointerEnd = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    lastBrushPointRef.current = null;
  }, []);

  const shouldIgnoreMouseFallback = useCallback(
    () => Date.now() - lastPointerInputAtRef.current < MOUSE_FALLBACK_IGNORE_MS,
    [],
  );

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (shouldIgnoreMouseFallback()) {
        return;
      }

      const point = getBrushPoint(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      event.preventDefault();
      isMousePaintingRef.current = true;
      lastBrushPointRef.current = point;
      paintBrushStroke(null, point);
    },
    [getBrushPoint, paintBrushStroke, shouldIgnoreMouseFallback],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (!isMousePaintingRef.current || shouldIgnoreMouseFallback()) {
        return;
      }

      const point = getBrushPoint(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      event.preventDefault();
      paintBrushStroke(lastBrushPointRef.current, point);
      lastBrushPointRef.current = point;
    },
    [getBrushPoint, paintBrushStroke, shouldIgnoreMouseFallback],
  );

  const handleMouseEnd = useCallback(() => {
    isMousePaintingRef.current = false;
    lastBrushPointRef.current = null;
  }, []);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (Date.now() - lastBrushInputAtRef.current < MOUSE_FALLBACK_IGNORE_MS) {
        return;
      }

      const point = getBrushPoint(event.clientX, event.clientY);

      if (point) {
        paintBrushStroke(null, point);
      }
    },
    [getBrushPoint, paintBrushStroke],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });

    if (!canvas || !context) {
      return;
    }

    canvas.width = simulationSize.width;
    canvas.height = simulationSize.height;
    imageDataRef.current = context.createImageData(simulationSize.width, simulationSize.height);
    stateRef.current = createSimulationState(simulationSize.width, simulationSize.height, seedMode);
    motionSampleRef.current = null;
    motionShakeRef.current = createMotionShakeState();
  }, [
    canvasRef,
    motionSampleRef,
    resetKey,
    seedMode,
    simulationSize.height,
    simulationSize.width,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });

    if (!canvas || !context) {
      return;
    }

    let animationFrame = 0;

    const tick = () => {
      const state = stateRef.current;
      const imageData = imageDataRef.current;

      if (state && imageData) {
        if (motionShakeActiveRef.current) {
          const sample = motionSampleRef.current;
          motionSampleRef.current = null;
          motionShakeRef.current = sample
            ? updateMotionShakeState(motionShakeRef.current, sample)
            : settleMotionShakeState(motionShakeRef.current);
          applyMotionShakeDisturbance(state, motionShakeRef.current);
        }

        if (!pausedRef.current) {
          stepSimulation(state, paramsRef.current, STEPS_PER_FRAME);
        }

        writePatternImageData(state, imageData);
        context.putImageData(imageData, 0, 0);
      }

      animationFrame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      className="simulation-canvas"
      aria-label="Animated Gray-Scott reaction-diffusion pattern"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseEnd}
      onMouseLeave={handleMouseEnd}
      onClick={handleClick}
    />
  );
}
