import type { Filter } from '../../assets/schemas.ts';
import { CHANNEL_MAX } from '../tuning.ts';
import {
  applyBlur,
  applyColorMatrix,
  applyGlow,
  applyGradientGlow,
  boxRadius,
  gradientLookup,
  type GlowOptions,
  type GradientGlowOptions,
  type GradientStop,
} from './pixelFilters.ts';

export type PixelEffect =
  | { readonly kind: 'glow'; readonly options: GlowOptions }
  | { readonly kind: 'gradientGlow'; readonly options: GradientGlowOptions }
  | { readonly kind: 'blur'; readonly blurX: number; readonly blurY: number; readonly passes: number }
  | { readonly kind: 'colorMatrix'; readonly matrix: readonly number[] };

interface FilterColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const DEFAULT_PASSES = 1;
const BLACK: FilterColor = { r: 0, g: 0, b: 0, a: CHANNEL_MAX };

function numberField(filter: Filter, key: string, fallback: number): number {
  const value = (filter as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : fallback;
}

function booleanField(filter: Filter, key: string, fallback: boolean): boolean {
  const value = (filter as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

function colorField(filter: Filter, key: string): FilterColor {
  const value = (filter as Record<string, unknown>)[key];
  if (value && typeof value === 'object') {
    const color = value as Partial<FilterColor>;
    return { r: color.r ?? 0, g: color.g ?? 0, b: color.b ?? 0, a: color.a ?? CHANNEL_MAX };
  }
  return BLACK;
}

function glowEffect(filter: Filter, colorKey: string, offsetX: number, offsetY: number, resolution: number): PixelEffect | undefined {
  if (booleanField(filter, 'innerGlow', false) || booleanField(filter, 'innerShadow', false)) return undefined;
  const color = colorField(filter, colorKey);
  return {
    kind: 'glow',
    options: {
      color,
      colorAlpha: color.a / CHANNEL_MAX,
      blurX: numberField(filter, 'blurX', 0) * resolution,
      blurY: numberField(filter, 'blurY', 0) * resolution,
      strength: numberField(filter, 'strength', 1),
      passes: numberField(filter, 'passes', DEFAULT_PASSES),
      offsetX: offsetX * resolution,
      offsetY: offsetY * resolution,
      knockout: booleanField(filter, 'knockout', false),
      hideObject: !booleanField(filter, 'compositeSource', true),
    },
  };
}

function gradientStops(filter: Filter): GradientStop[] {
  const record = filter as Record<string, unknown>;
  const colors = Array.isArray(record.gradientColors) ? record.gradientColors : [];
  const ratios = Array.isArray(record.gradientRatio) ? record.gradientRatio : [];
  return colors.flatMap((value: unknown, index) => {
    const ratio = ratios[index] as unknown;
    if (!value || typeof value !== 'object' || typeof ratio !== 'number') return [];
    const color = value as Partial<FilterColor>;
    return [{ ratio, r: color.r ?? 0, g: color.g ?? 0, b: color.b ?? 0, a: color.a ?? CHANNEL_MAX }];
  });
}

function gradientGlowEffect(filter: Filter, resolution: number): PixelEffect | undefined {
  if (booleanField(filter, 'innerShadow', false) || booleanField(filter, 'onTop', false)) return undefined;
  const stops = gradientStops(filter);
  if (stops.length === 0) return undefined;
  const distance = numberField(filter, 'distance', 0) * resolution;
  const angle = numberField(filter, 'angle', 0);
  return {
    kind: 'gradientGlow',
    options: {
      gradient: gradientLookup(stops),
      blurX: numberField(filter, 'blurX', 0) * resolution,
      blurY: numberField(filter, 'blurY', 0) * resolution,
      strength: numberField(filter, 'strength', 1),
      passes: numberField(filter, 'passes', DEFAULT_PASSES),
      offsetX: Math.cos(angle) * distance,
      offsetY: Math.sin(angle) * distance,
      knockout: booleanField(filter, 'knockout', false),
      hideObject: !booleanField(filter, 'compositeSource', true),
    },
  };
}

export function toPixelEffect(filter: Filter, resolution = 1): PixelEffect | undefined {
  switch (filter.type) {
    case 'glow':
      return glowEffect(filter, 'glowColor', 0, 0, resolution);
    case 'gradientGlow':
      return gradientGlowEffect(filter, resolution);
    case 'dropShadow': {
      const distance = numberField(filter, 'distance', 0);
      const angle = numberField(filter, 'angle', 0);
      return glowEffect(filter, 'dropShadowColor', Math.cos(angle) * distance, Math.sin(angle) * distance, resolution);
    }
    case 'blur': {
      const blurX = numberField(filter, 'blurX', 0) * resolution;
      const blurY = numberField(filter, 'blurY', 0) * resolution;
      if (boxRadius(blurX) === 0 && boxRadius(blurY) === 0) return undefined;
      return { kind: 'blur', blurX, blurY, passes: numberField(filter, 'passes', DEFAULT_PASSES) };
    }
    case 'colorMatrix': {
      const matrix = (filter as Record<string, unknown>).matrix;
      return Array.isArray(matrix) ? { kind: 'colorMatrix', matrix: matrix.filter((value): value is number => typeof value === 'number') } : undefined;
    }
    default:
      return undefined;
  }
}

export function pixelEffects(filters: readonly Filter[] | undefined, resolution = 1): PixelEffect[] {
  return (filters ?? []).map((filter) => toPixelEffect(filter, resolution)).filter((effect): effect is PixelEffect => effect !== undefined);
}

export function effectPadding(effects: readonly PixelEffect[]): number {
  let padding = 0;
  for (const effect of effects) {
    if (effect.kind === 'glow' || effect.kind === 'gradientGlow') {
      const { options } = effect;
      const spread = (boxRadius(options.blurX) + boxRadius(options.blurY)) * options.passes;
      padding += spread + Math.ceil(Math.hypot(options.offsetX ?? 0, options.offsetY ?? 0));
    } else if (effect.kind === 'blur') {
      padding += (boxRadius(effect.blurX) + boxRadius(effect.blurY)) * effect.passes;
    }
  }
  return padding;
}

export function applyEffects(pixels: Uint8ClampedArray, width: number, height: number, effects: readonly PixelEffect[]): void {
  for (const effect of effects) {
    if (effect.kind === 'glow') applyGlow(pixels, width, height, effect.options);
    else if (effect.kind === 'gradientGlow') applyGradientGlow(pixels, width, height, effect.options);
    else if (effect.kind === 'blur') applyBlur(pixels, width, height, effect.blurX, effect.blurY, effect.passes);
    else applyColorMatrix(pixels, effect.matrix);
  }
}
