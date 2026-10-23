export function cycleFrame(index: number, delta: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return (((Math.trunc(index) + delta) % frameCount) + frameCount) % frameCount;
}
