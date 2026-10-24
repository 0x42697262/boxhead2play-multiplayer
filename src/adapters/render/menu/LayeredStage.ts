import type { DisplayItem } from '../../assets/schemas.ts';
import { effectPadding, pixelEffects } from '../color/filters.ts';
import { multiply, translation, type Matrix } from '../geometry/Matrix.ts';
import { inflate, transformRect, union, type Rect } from '../geometry/Rect.ts';
import { resetContext, type Surface } from '../surface.ts';
import { childOverride, withReplacements, type ChildOverride, type Overrides } from '../symbols/SymbolLibrary.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { STAGE_BACKGROUND, STAGE_LAYER_CACHE_LIMIT, STAGE_LAYER_PADDING_PX } from '../tuning.ts';

export interface StageScene {
  readonly items: readonly DisplayItem[];
  readonly overrides: Overrides;
  readonly expand: ReadonlySet<string>;
}

export interface StageLayer {
  readonly key: string;
  readonly items: readonly DisplayItem[];
  readonly matrix: Matrix;
  readonly overrides: Overrides | undefined;
}

interface PlacedBitmap {
  readonly surface: Surface;
  readonly x: number;
  readonly y: number;
}

function isPlainContainer(item: DisplayItem, own: ChildOverride | undefined): boolean {
  const filters = own?.filters ?? item.filters ?? [];
  return filters.length === 0 && item.colorTransform === undefined && item.clipDepth === undefined && own?.alpha === undefined && own?.clip === undefined;
}

function layerKey(path: string, items: readonly DisplayItem[], matrix: Matrix, overrides: Overrides | undefined): string {
  const own = items.map((item) => childOverride(overrides, item) ?? null);
  return `${path}|${items.map((item) => `${item.depth}:${item.characterId}`).join(',')}|${matrix.join(',')}|${JSON.stringify(own)}`;
}

export class LayeredStage {
  private readonly cache = new Map<string, PlacedBitmap | null>();
  private composedKey: string | undefined = undefined;
  private current: Surface;
  private currentResolution = 1;

  constructor(
    private readonly renderer: SymbolRenderer,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.current = renderer.createSurface(width, height);
  }

  get surface(): Surface {
    return this.current;
  }

  get resolution(): number {
    return this.currentResolution;
  }

  setResolution(resolution: number): void {
    if (resolution === this.currentResolution) return;
    this.currentResolution = resolution;
    this.current = this.renderer.createSurface(this.width * resolution, this.height * resolution);
    this.cache.clear();
    this.composedKey = undefined;
  }

  layers(scene: StageScene): StageLayer[] {
    const layers: StageLayer[] = [];
    this.collect(withReplacements(scene.items, scene.overrides), scene.overrides, [this.currentResolution, 0, 0, this.currentResolution, 0, 0], scene.expand, '', layers);
    return layers;
  }

  render(scene: StageScene): Surface {
    const layers = this.layers(scene);
    const key = layers.map((layer) => layer.key).join('\n');
    if (key === this.composedKey) return this.current;
    const ctx = this.current.ctx;
    resetContext(ctx);
    ctx.fillStyle = STAGE_BACKGROUND;
    ctx.fillRect(0, 0, this.current.width, this.current.height);
    for (const layer of layers) {
      const bitmap = this.bitmap(layer);
      if (bitmap) ctx.drawImage(bitmap.surface.canvas, bitmap.x, bitmap.y);
    }
    this.composedKey = key;
    return this.current;
  }

  private collect(items: readonly DisplayItem[], overrides: Overrides | undefined, matrix: Matrix, expand: ReadonlySet<string>, path: string, out: StageLayer[]): void {
    let index = 0;
    while (index < items.length) {
      const item = items[index] as DisplayItem;
      const clipDepth = item.clipDepth;
      if (clipDepth !== undefined) {
        let end = index + 1;
        while (end < items.length && (items[end] as DisplayItem).depth <= clipDepth) end++;
        const group = items.slice(index, end);
        out.push({ key: layerKey(path, group, matrix, overrides), items: group, matrix, overrides });
        index = end;
        continue;
      }
      index++;
      const own = childOverride(overrides, item);
      if ((own?.visible ?? item.visible ?? true) === false) continue;
      const library = this.renderer.library;
      if (library.sprite(item.characterId)?.selfHidden === true) continue;
      if (item.name !== undefined && expand.has(item.name) && library.sprite(item.characterId) && isPlainContainer(item, own)) {
        const children = library.composedItems(item.characterId, own?.frame ?? 0, own);
        this.collect(children, own?.children, multiply(matrix, own?.matrix ?? item.matrix), expand, `${path}/${item.depth}`, out);
        continue;
      }
      out.push({ key: layerKey(path, [item], matrix, overrides), items: [item], matrix, overrides });
    }
  }

  private bitmap(layer: StageLayer): PlacedBitmap | undefined {
    const cached = this.cache.get(layer.key);
    if (cached !== undefined) {
      this.cache.delete(layer.key);
      this.cache.set(layer.key, cached);
      return cached ?? undefined;
    }
    const bitmap = this.renderLayer(layer);
    if (this.cache.size >= STAGE_LAYER_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(layer.key, bitmap ?? null);
    return bitmap;
  }

  private renderLayer(layer: StageLayer): PlacedBitmap | undefined {
    const library = this.renderer.library;
    let bounds: Rect | null = null;
    let padding = STAGE_LAYER_PADDING_PX * this.currentResolution;
    for (const item of layer.items) {
      const own = childOverride(layer.overrides, item);
      const local = library.instanceBounds(item.characterId, own, item.ratio ?? 0);
      if (local) bounds = union(bounds, transformRect(local, multiply(layer.matrix, own?.matrix ?? item.matrix)));
      padding += effectPadding(pixelEffects(own?.filters ?? item.filters, this.currentResolution));
    }
    if (!bounds) return undefined;
    const area = inflate(bounds, padding, padding);
    const x = Math.max(0, Math.floor(area.xMin));
    const y = Math.max(0, Math.floor(area.yMin));
    const xMax = Math.min(this.current.width, Math.ceil(area.xMax));
    const yMax = Math.min(this.current.height, Math.ceil(area.yMax));
    if (xMax <= x || yMax <= y) return undefined;
    const surface = this.renderer.createSurface(xMax - x, yMax - y);
    this.renderer.drawItems(surface.ctx, layer.items, multiply(translation(-x, -y), layer.matrix), { overrides: layer.overrides ?? {}, resolution: this.currentResolution });
    return { surface, x, y };
  }
}
