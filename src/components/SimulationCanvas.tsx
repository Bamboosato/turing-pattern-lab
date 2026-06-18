import { useEffect, useRef, type RefObject } from 'react';
import { createSimulationState, stepSimulation } from '../simulation/grayScott';
import { writePatternImageData } from '../simulation/render';
import type { SimulationSize } from '../simulation/size';
import type { ReactionDiffusionParams, SeedMode, SimulationState } from '../simulation/types';

const STEPS_PER_FRAME = 3;

type SimulationCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  params: ReactionDiffusionParams;
  isPaused: boolean;
  resetKey: number;
  seedMode: SeedMode;
  simulationSize: SimulationSize;
};

export function SimulationCanvas({
  canvasRef,
  params,
  isPaused,
  resetKey,
  seedMode,
  simulationSize,
}: SimulationCanvasProps) {
  const paramsRef = useRef(params);
  const pausedRef = useRef(isPaused);
  const stateRef = useRef<SimulationState | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

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
  }, [canvasRef, resetKey, seedMode, simulationSize.height, simulationSize.width]);

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
    />
  );
}
