import type { ReactionDiffusionParams, SeedMode } from '../simulation/types';

export type PatternPreset = {
  id: string;
  name: string;
  description: string;
  params: ReactionDiffusionParams;
  seedMode: SeedMode;
};

export const patternPresets = [
  {
    id: 'zebra',
    name: 'Zebra',
    description: 'High-contrast bands that settle into stripe-like wavefronts.',
    params: {
      feed: 0.022,
      kill: 0.051,
      diffA: 1,
      diffB: 0.5,
    },
    seedMode: 'stripe',
  },
  {
    id: 'giraffe',
    name: 'Giraffe',
    description: 'Branching cells and island edges inspired by giraffe coat markings.',
    params: {
      feed: 0.034,
      kill: 0.056,
      diffA: 1,
      diffB: 0.5,
    },
    seedMode: 'web',
  },
  {
    id: 'leopard',
    name: 'Leopard',
    description: 'Dense spot clusters that separate into organic rosettes.',
    params: {
      feed: 0.0367,
      kill: 0.0649,
      diffA: 1,
      diffB: 0.5,
    },
    seedMode: 'spots',
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Soft growth fronts that branch outward from small initial colonies.',
    params: {
      feed: 0.0545,
      kill: 0.062,
      diffA: 1,
      diffB: 0.5,
    },
    seedMode: 'center',
  },
  {
    id: 'maze',
    name: 'Maze',
    description: 'Labyrinth paths that emerge from a simple central seed.',
    params: {
      feed: 0.029,
      kill: 0.057,
      diffA: 1,
      diffB: 0.5,
    },
    seedMode: 'center',
  },
] satisfies PatternPreset[];

export const defaultPreset = patternPresets[0];
