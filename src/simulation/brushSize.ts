import type { SimulationSize } from './size';

const BASE_BRUSH_RADIUS_RATIO = 0.028;
const DEFAULT_BRUSH_RADIUS_SCALE = 0.8;
const MIN_BRUSH_RADIUS = 4;

export function getGestureBrushRadius(
  simulationSize: SimulationSize,
  scalePercent: number,
): number {
  const minDimension = Math.min(simulationSize.width, simulationSize.height);
  const scaleMultiplier = Math.max(0.01, scalePercent / 100);
  const radius =
    (minDimension * BASE_BRUSH_RADIUS_RATIO * DEFAULT_BRUSH_RADIUS_SCALE) /
    scaleMultiplier;

  return Math.max(MIN_BRUSH_RADIUS, Math.round(radius));
}
