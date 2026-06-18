export type ReactionDiffusionParams = {
  feed: number;
  kill: number;
  diffA: number;
  diffB: number;
};

export type SeedMode = 'center' | 'stripe' | 'spots' | 'web' | 'noise';

export type SimulationState = {
  width: number;
  height: number;
  a: Float32Array;
  b: Float32Array;
  nextA: Float32Array;
  nextB: Float32Array;
};

export type RandomPattern = {
  params: ReactionDiffusionParams;
  seedMode: SeedMode;
};
