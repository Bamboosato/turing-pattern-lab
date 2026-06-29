import type { SeedMode } from './types';

type SeedModeOption = {
  value: SeedMode;
  label: string;
};

export const SEED_MODE_OPTIONS = [
  { value: 'center', label: 'Center' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'spots', label: 'Spots' },
  { value: 'web', label: 'Web' },
  { value: 'noise', label: 'Noise' },
] satisfies SeedModeOption[];

const SEED_MODE_VALUES = new Set<SeedMode>(
  SEED_MODE_OPTIONS.map((option) => option.value),
);

export function isSeedMode(value: unknown): value is SeedMode {
  return typeof value === 'string' && SEED_MODE_VALUES.has(value as SeedMode);
}
