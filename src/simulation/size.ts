export type SimulationSize = {
  width: number;
  height: number;
};

export const NORMAL_SIMULATION_SIZE: SimulationSize = {
  width: 224,
  height: 224,
};

const MAX_FULLSCREEN_CELLS = 90_000;
const MIN_FULLSCREEN_EDGE = 120;

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
