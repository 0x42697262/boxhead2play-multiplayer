import { BYTE_MASK, CHANNEL_MAX, GREEN_SHIFT, MAX_FILTER_STRENGTH, RED_SHIFT, RGBA_STRIDE } from '../tuning.ts';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface GlowOptions {
  readonly color: Rgb;
  readonly colorAlpha: number;
  readonly blurX: number;
  readonly blurY: number;
  readonly strength: number;
  readonly passes: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly knockout?: boolean;
  readonly hideObject?: boolean;
}

export interface GradientStop {
  readonly ratio: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface GradientGlowOptions {
  readonly gradient: Uint8ClampedArray;
  readonly blurX: number;
  readonly blurY: number;
  readonly strength: number;
  readonly passes: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly knockout: boolean;
  readonly hideObject: boolean;
}

export const GRADIENT_STEPS = CHANNEL_MAX + 1;

const COLOR_MATRIX_ROW = 5;
const COLOR_MATRIX_OFFSET = 4;
const COLOR_MATRIX_CHANNELS = 4;

export function rgbFromNumber(color: number): Rgb {
  return { r: (color >> RED_SHIFT) & BYTE_MASK, g: (color >> GREEN_SHIFT) & BYTE_MASK, b: color & BYTE_MASK };
}

export function boxRadius(blur: number): number {
  return Math.max(0, Math.floor(blur / 2));
}

function blurLine(source: Float32Array, target: Float32Array, start: number, step: number, count: number, radius: number): void {
  const window = radius * 2 + 1;
  let sum = 0;
  for (let offset = 0; offset <= Math.min(radius, count - 1); offset++) sum += source[start + offset * step] as number;
  for (let position = 0; position < count; position++) {
    target[start + position * step] = sum / window;
    const leaving = position - radius;
    const entering = position + radius + 1;
    if (leaving >= 0) sum -= source[start + leaving * step] as number;
    if (entering < count) sum += source[start + entering * step] as number;
  }
}

export function boxBlur(channel: Float32Array, width: number, height: number, blurX: number, blurY: number, passes: number): Float32Array {
  let current = channel;
  const radiusX = boxRadius(blurX);
  const radiusY = boxRadius(blurY);
  for (let pass = 0; pass < passes; pass++) {
    const horizontal = new Float32Array(current.length);
    for (let row = 0; row < height; row++) blurLine(current, horizontal, row * width, 1, width, radiusX);
    const vertical = new Float32Array(current.length);
    for (let column = 0; column < width; column++) blurLine(horizontal, vertical, column, width, height, radiusY);
    current = vertical;
  }
  return current;
}

export function alphaChannel(pixels: Uint8ClampedArray): Float32Array {
  const alpha = new Float32Array(pixels.length / RGBA_STRIDE);
  for (let index = 0; index < alpha.length; index++) alpha[index] = (pixels[index * RGBA_STRIDE + 3] as number) / CHANNEL_MAX;
  return alpha;
}

function shifted(channel: Float32Array, width: number, height: number, dx: number, dy: number): Float32Array {
  if (dx === 0 && dy === 0) return channel;
  const result = new Float32Array(channel.length);
  for (let y = 0; y < height; y++) {
    const sourceY = y - dy;
    if (sourceY < 0 || sourceY >= height) continue;
    for (let x = 0; x < width; x++) {
      const sourceX = x - dx;
      if (sourceX >= 0 && sourceX < width) result[y * width + x] = channel[sourceY * width + sourceX] as number;
    }
  }
  return result;
}

export function applyGlow(pixels: Uint8ClampedArray, width: number, height: number, options: GlowOptions): void {
  const blurred = boxBlur(alphaChannel(pixels), width, height, options.blurX, options.blurY, options.passes);
  const glow = shifted(blurred, width, height, Math.round(options.offsetX ?? 0), Math.round(options.offsetY ?? 0));
  const strength = Math.min(options.strength, MAX_FILTER_STRENGTH);
  const { r, g, b } = options.color;
  for (let index = 0; index < glow.length; index++) {
    const base = index * RGBA_STRIDE;
    const sourceAlpha = (pixels[base + 3] as number) / CHANNEL_MAX;
    let glowAlpha = Math.min(1, (glow[index] as number) * strength) * options.colorAlpha;
    if (options.knockout) glowAlpha *= 1 - sourceAlpha;
    const keepSource = !options.hideObject && !options.knockout;
    const ownAlpha = keepSource ? sourceAlpha : 0;
    const outAlpha = ownAlpha + glowAlpha * (1 - ownAlpha);
    if (outAlpha <= 0) {
      pixels[base + 3] = 0;
      continue;
    }
    const glowWeight = glowAlpha * (1 - ownAlpha);
    pixels[base] = ((pixels[base] as number) * ownAlpha + r * glowWeight) / outAlpha;
    pixels[base + 1] = ((pixels[base + 1] as number) * ownAlpha + g * glowWeight) / outAlpha;
    pixels[base + 2] = ((pixels[base + 2] as number) * ownAlpha + b * glowWeight) / outAlpha;
    pixels[base + 3] = outAlpha * CHANNEL_MAX;
  }
}

function stopChannel(stop: GradientStop, channel: number): number {
  return [stop.r, stop.g, stop.b, stop.a][channel] ?? 0;
}

export function gradientLookup(stops: readonly GradientStop[]): Uint8ClampedArray {
  const table = new Uint8ClampedArray(GRADIENT_STEPS * RGBA_STRIDE);
  const sorted = [...stops].sort((left, right) => left.ratio - right.ratio);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return table;
  for (let step = 0; step < GRADIENT_STEPS; step++) {
    const upperIndex = sorted.findIndex((stop) => stop.ratio >= step);
    const upper = upperIndex < 0 ? last : (sorted[upperIndex] as GradientStop);
    const lower = upperIndex <= 0 ? upper : (sorted[upperIndex - 1] as GradientStop);
    const span = upper.ratio - lower.ratio;
    const mix = span > 0 ? (step - lower.ratio) / span : 0;
    for (let channel = 0; channel < RGBA_STRIDE; channel++) {
      const from = stopChannel(lower, channel);
      table[step * RGBA_STRIDE + channel] = from + (stopChannel(upper, channel) - from) * mix;
    }
  }
  return table;
}

export function applyGradientGlow(pixels: Uint8ClampedArray, width: number, height: number, options: GradientGlowOptions): void {
  const blurred = boxBlur(alphaChannel(pixels), width, height, options.blurX, options.blurY, options.passes);
  const glow = shifted(blurred, width, height, Math.round(options.offsetX), Math.round(options.offsetY));
  const strength = Math.min(options.strength, MAX_FILTER_STRENGTH);
  const keepSource = !options.hideObject && !options.knockout;
  for (let index = 0; index < glow.length; index++) {
    const base = index * RGBA_STRIDE;
    const step = Math.round(Math.min(1, (glow[index] as number) * strength) * CHANNEL_MAX) * RGBA_STRIDE;
    const sourceAlpha = (pixels[base + 3] as number) / CHANNEL_MAX;
    let glowAlpha = (options.gradient[step + 3] as number) / CHANNEL_MAX;
    if (options.knockout) glowAlpha *= 1 - sourceAlpha;
    const ownAlpha = keepSource ? sourceAlpha : 0;
    const outAlpha = ownAlpha + glowAlpha * (1 - ownAlpha);
    if (outAlpha <= 0) {
      pixels[base + 3] = 0;
      continue;
    }
    const glowWeight = glowAlpha * (1 - ownAlpha);
    for (let channel = 0; channel < 3; channel++) {
      pixels[base + channel] = ((pixels[base + channel] as number) * ownAlpha + (options.gradient[step + channel] as number) * glowWeight) / outAlpha;
    }
    pixels[base + 3] = outAlpha * CHANNEL_MAX;
  }
}

export function applyBlur(pixels: Uint8ClampedArray, width: number, height: number, blurX: number, blurY: number, passes: number): void {
  const count = pixels.length / RGBA_STRIDE;
  const channels = Array.from({ length: RGBA_STRIDE }, () => new Float32Array(count));
  for (let index = 0; index < count; index++) {
    const alpha = (pixels[index * RGBA_STRIDE + 3] as number) / CHANNEL_MAX;
    for (let channel = 0; channel < 3; channel++) (channels[channel] as Float32Array)[index] = (pixels[index * RGBA_STRIDE + channel] as number) * alpha;
    (channels[3] as Float32Array)[index] = alpha;
  }
  const blurred = channels.map((channel) => boxBlur(channel, width, height, blurX, blurY, passes));
  for (let index = 0; index < count; index++) {
    const alpha = (blurred[3] as Float32Array)[index] as number;
    for (let channel = 0; channel < 3; channel++) {
      pixels[index * RGBA_STRIDE + channel] = alpha > 0 ? ((blurred[channel] as Float32Array)[index] as number) / alpha : 0;
    }
    pixels[index * RGBA_STRIDE + 3] = alpha * CHANNEL_MAX;
  }
}

export function applyColorMatrix(pixels: Uint8ClampedArray, matrix: readonly number[]): void {
  const input = [0, 0, 0, 0];
  for (let index = 0; index < pixels.length; index += RGBA_STRIDE) {
    for (let channel = 0; channel < COLOR_MATRIX_CHANNELS; channel++) input[channel] = pixels[index + channel] as number;
    for (let channel = 0; channel < COLOR_MATRIX_CHANNELS; channel++) {
      const row = channel * COLOR_MATRIX_ROW;
      let value = matrix[row + COLOR_MATRIX_OFFSET] ?? 0;
      for (let source = 0; source < COLOR_MATRIX_CHANNELS; source++) value += (matrix[row + source] ?? 0) * (input[source] as number);
      pixels[index + channel] = value;
    }
  }
}
