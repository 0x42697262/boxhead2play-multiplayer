import type { CharacterStyle } from '../../../domain/visuals.ts';
import type { XsiCatalog } from '../../assets/schemas.ts';
import type { BufferedBitmap } from '../surface.ts';
import { buildXsiDrawing, indexSets, type SetIndex } from './framePlanes.ts';
import { buildStyleSheet, type StyleSheet } from './styleSheets.ts';
import type { XsiRasterizer } from './XsiRasterizer.ts';

export interface XsiFrameKey {
  readonly style: CharacterStyle;
  readonly styleScale: number;
  readonly animation: string;
  readonly direction: number;
  readonly sourceFrame: number;
}

export interface StyleCollection {
  readonly style: CharacterStyle;
  readonly styleScale: number;
  readonly setIds: readonly string[];
}

export function frameKey(key: XsiFrameKey): string {
  return `${key.style}|${key.styleScale}|${key.animation}|${key.direction}|${key.sourceFrame}`;
}

export function collectionFrames(xsi: XsiCatalog, collection: StyleCollection): XsiFrameKey[] {
  const keys: XsiFrameKey[] = [];
  for (const animation of new Set(collection.setIds)) {
    const set = xsi.sets[animation];
    if (!set) continue;
    set.directions.forEach((frames, direction) => {
      frames.forEach((_frame, sourceFrame) => keys.push({ style: collection.style, styleScale: collection.styleScale, animation, direction, sourceFrame }));
    });
  }
  return keys;
}

export class XsiFrameCache {
  private readonly frames = new Map<string, BufferedBitmap | null>();
  private readonly sheets = new Map<string, StyleSheet>();
  private readonly index: SetIndex;
  private queue: XsiFrameKey[] = [];

  constructor(
    private readonly xsi: XsiCatalog,
    private readonly rasterizer: XsiRasterizer,
  ) {
    this.index = indexSets(xsi);
  }

  get pending(): number {
    return this.queue.length;
  }

  get size(): number {
    return this.frames.size;
  }

  setResolution(resolution: number): void {
    if (resolution === this.rasterizer.resolution) return;
    this.rasterizer.setResolution(resolution);
    this.frames.clear();
  }

  frame(key: XsiFrameKey): BufferedBitmap | undefined {
    const id = frameKey(key);
    const hit = this.frames.get(id);
    if (hit !== undefined) return hit ?? undefined;
    const drawing = buildXsiDrawing(this.xsi, this.index, this.sheet(key.style, key.styleScale), key.animation, key.direction, key.sourceFrame);
    const bitmap = drawing ? this.rasterizer.rasterize(drawing) : null;
    this.frames.set(id, bitmap);
    return bitmap ?? undefined;
  }

  enqueue(collection: StyleCollection): void {
    this.queue.push(...collectionFrames(this.xsi, collection).filter((key) => !this.frames.has(frameKey(key))));
  }

  prewarm(hasTime: () => boolean): number {
    let rendered = 0;
    while (this.queue.length > 0 && hasTime()) {
      const key = this.queue.pop();
      if (key && !this.frames.has(frameKey(key))) {
        this.frame(key);
        rendered++;
      }
    }
    return rendered;
  }

  private sheet(style: CharacterStyle, scale: number): StyleSheet {
    const id = `${style}|${scale}`;
    let sheet = this.sheets.get(id);
    if (!sheet) {
      sheet = buildStyleSheet(style, this.xsi, scale);
      this.sheets.set(id, sheet);
    }
    return sheet;
  }
}
