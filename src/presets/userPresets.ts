import { BASE_DIFFUSION, FEED_RANGE, KILL_RANGE, clamp, roundParam } from '../simulation/random';
import { normalizeHexColor, type PatternPalette } from '../simulation/palette';
import type { ReactionDiffusionParams, SeedMode } from '../simulation/types';
import type { PatternPreset } from './presets';

export const USER_PRESETS_STORAGE_KEY = 'turing-pattern-lab:user-presets:v1';

const USER_PRESET_ID_PREFIX = 'user:';
const MAX_USER_PRESETS = 30;
const SEED_MODES = new Set<SeedMode>(['center', 'stripe', 'spots', 'web', 'noise']);

export type UserPreset = PatternPreset & {
  createdAt: number;
  palette?: PatternPalette;
};

type UserPresetInput = {
  name: string;
  params: ReactionDiffusionParams;
  seedMode: SeedMode;
  palette?: PatternPalette;
  now?: () => number;
  random?: () => number;
};

type UserPresetStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function isUserPresetId(id: string): boolean {
  return id.startsWith(USER_PRESET_ID_PREFIX);
}

export function getDefaultUserPresetName(count: number): string {
  return `Custom ${count + 1}`;
}

export function createUserPreset({
  name,
  params,
  seedMode,
  palette,
  now = Date.now,
  random = Math.random,
}: UserPresetInput): UserPreset {
  const createdAt = now();
  const normalizedParams = normalizeParams(params);
  const normalizedPalette = palette ? normalizePalette(palette) : null;

  return {
    id: `${USER_PRESET_ID_PREFIX}${createdAt.toString(36)}-${Math.floor(random() * 1_000_000).toString(36)}`,
    name: normalizeName(name) || 'Custom Pattern',
    description: createUserPresetDescription(normalizedParams, seedMode),
    params: normalizedParams,
    seedMode,
    createdAt,
    ...(normalizedPalette ? { palette: normalizedPalette } : {}),
  };
}

export function createUserPresetDescription(
  params: ReactionDiffusionParams,
  seedMode: SeedMode,
): string {
  return `Saved Feed ${params.feed.toFixed(4)} / Kill ${params.kill.toFixed(4)} / Seed ${seedMode}.`;
}

export function loadUserPresets(storage = getDefaultStorage()): UserPreset[] {
  if (!storage) {
    return [];
  }

  try {
    return parseUserPresets(storage.getItem(USER_PRESETS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveUserPresets(
  presets: UserPreset[],
  storage = getDefaultStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      USER_PRESETS_STORAGE_KEY,
      JSON.stringify(presets.filter(isValidUserPreset).slice(-MAX_USER_PRESETS)),
    );
  } catch {
    // Ignore unavailable or quota-limited storage; the active simulation still works.
  }
}

export function parseUserPresets(rawValue: string | null): UserPreset[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(parseUserPreset).filter((preset): preset is UserPreset => Boolean(preset));
  } catch {
    return [];
  }
}

function parseUserPreset(value: unknown): UserPreset | null {
  if (!isRecord(value) || !isRecord(value.params)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    !isUserPresetId(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !isSeedMode(value.seedMode)
  ) {
    return null;
  }

  const params = parseParams(value.params);

  if (!params) {
    return null;
  }

  const palette = parsePalette(value.palette);

  return {
    id: value.id,
    name: normalizeName(value.name) || 'Custom Pattern',
    description:
      typeof value.description === 'string'
        ? value.description
        : createUserPresetDescription(params, value.seedMode),
    params,
    seedMode: value.seedMode,
    createdAt: value.createdAt,
    ...(palette ? { palette } : {}),
  };
}

function parsePalette(value: unknown): PatternPalette | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.background !== 'string' || typeof value.material !== 'string') {
    return null;
  }

  return normalizePalette({
    background: value.background,
    material: value.material,
  });
}

function normalizePalette(palette: PatternPalette): PatternPalette | null {
  const background = normalizeHexColor(palette.background);
  const material = normalizeHexColor(palette.material);

  if (!background || !material) {
    return null;
  }

  return {
    background,
    material,
  };
}

function parseParams(value: Record<string, unknown>): ReactionDiffusionParams | null {
  const { feed, kill, diffA, diffB } = value;

  if (
    typeof feed !== 'number' ||
    feed < FEED_RANGE.min ||
    feed > FEED_RANGE.max ||
    typeof kill !== 'number' ||
    kill < KILL_RANGE.min ||
    kill > KILL_RANGE.max ||
    typeof diffA !== 'number' ||
    diffA <= 0 ||
    typeof diffB !== 'number' ||
    diffB <= 0
  ) {
    return null;
  }

  return {
    feed,
    kill,
    diffA,
    diffB,
  };
}

function normalizeParams(params: ReactionDiffusionParams): ReactionDiffusionParams {
  return {
    feed: roundParam(clamp(params.feed, FEED_RANGE.min, FEED_RANGE.max)),
    kill: roundParam(clamp(params.kill, KILL_RANGE.min, KILL_RANGE.max)),
    diffA: params.diffA > 0 ? params.diffA : BASE_DIFFUSION.diffA,
    diffB: params.diffB > 0 ? params.diffB : BASE_DIFFUSION.diffB,
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function isValidUserPreset(preset: UserPreset): boolean {
  return Boolean(parseUserPreset(preset));
}

function isSeedMode(value: unknown): value is SeedMode {
  return typeof value === 'string' && SEED_MODES.has(value as SeedMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getDefaultStorage(): UserPresetStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
