import { CANVAS_PROBE_AREAS_PX } from '../render/world/tuning.ts';
import type { DeviceHint } from '../render/world/planeResolution.ts';

export type CanvasAreaProbe = (width: number, height: number) => boolean;

const PROBE_COLOR = '#fff';
const PIXEL = 1;
const ALPHA_OFFSET = 3;

export const offscreenAreaProbe: CanvasAreaProbe = (width, height) => {
  let canvas: OffscreenCanvas | undefined;
  try {
    canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = PROBE_COLOR;
    ctx.fillRect(width - PIXEL, height - PIXEL, PIXEL, PIXEL);
    return (ctx.getImageData(width - PIXEL, height - PIXEL, PIXEL, PIXEL).data[ALPHA_OFFSET] ?? 0) > 0;
  } catch {
    return false;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};

export class CanvasAreaLimit {
  private largestWorking = 0;
  private smallestFailing = Number.POSITIVE_INFINITY;

  constructor(
    private readonly probe: CanvasAreaProbe,
    private readonly candidates: readonly number[] = CANVAS_PROBE_AREAS_PX,
  ) {}

  usableArea(wanted: number): number {
    const tries = [wanted, ...this.candidates.filter((area) => area < wanted)];
    return tries.find((area) => this.works(area)) ?? tries[tries.length - 1] ?? wanted;
  }

  private works(area: number): boolean {
    if (area <= this.largestWorking) return true;
    const side = Math.ceil(Math.sqrt(area));
    const tested = side * side;
    if (tested >= this.smallestFailing) return false;
    const works = this.probe(side, side);
    if (works) this.largestWorking = tested;
    else this.smallestFailing = tested;
    return works;
  }
}

export interface DeviceHintSource {
  readonly navigator: Navigator;
  readonly coarsePointer: boolean;
}

function deviceMemoryOf(navigator: Navigator): number | undefined {
  const memory: unknown = 'deviceMemory' in navigator ? navigator.deviceMemory : undefined;
  return typeof memory === 'number' && memory > 0 ? memory : undefined;
}

export function readDeviceHint(source: DeviceHintSource): DeviceHint {
  return { memoryGiB: deviceMemoryOf(source.navigator), touch: source.coarsePointer || source.navigator.maxTouchPoints > 0 };
}
