export type SimulationSize = {
  width: number;
  height: number;
};

export const NORMAL_SIMULATION_SIZE: SimulationSize = {
  width: 224,
  height: 224,
};

export const SIMULATION_SCALE_RANGE = {
  min: 50,
  max: 200,
  step: 10,
} as const;

const MAX_FULLSCREEN_CELLS = 90_000;
const MIN_FULLSCREEN_EDGE = 120;

function clampScalePercent(scalePercent: number) {
  return Math.min(
    SIMULATION_SCALE_RANGE.max,
    Math.max(SIMULATION_SCALE_RANGE.min, scalePercent),
  );
}

export function getScaledSimulationSize(
  baseSize: SimulationSize,
  scalePercent: number,
): SimulationSize {
  const multiplier = clampScalePercent(scalePercent) / 100;

  return {
    width: Math.max(1, Math.round(baseSize.width * multiplier)),
    height: Math.max(1, Math.round(baseSize.height * multiplier)),
  };
}

export function getFullscreenSimulationSize(
  viewportWidth: number,
  viewportHeight: number,
): SimulationSize {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return NORMAL_SIMULATION_SIZE;
  }

  const aspectRatio = viewportWidth / viewportHeight;
  const height = Math.sqrt(MAX_FULLSCREEN_CELLS / aspectRatio);
  const width = height * aspectRatio;

  return {
    width: Math.max(MIN_FULLSCREEN_EDGE, Math.round(width)),
    height: Math.max(MIN_FULLSCREEN_EDGE, Math.round(height)),
  };
}
