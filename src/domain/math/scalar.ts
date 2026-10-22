export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function roundToBase(value: number, base: number): number {
  return Math.round(value / base) * base;
}

export function truncateToCell(value: number): number {
  return Math.trunc(value);
}

const DEFAULT_TWEEN_POWER = 15;

export function tween(min: number, max: number, factor: number, easeIn = 0, power = DEFAULT_TWEEN_POWER): number {
  let eased = factor;
  if (easeIn < 0) eased = Math.pow(factor, power * -easeIn + 1);
  if (easeIn > 0) eased = 1 - Math.pow(1 - factor, power * easeIn + 1);
  return (max - min) * eased + min;
}
