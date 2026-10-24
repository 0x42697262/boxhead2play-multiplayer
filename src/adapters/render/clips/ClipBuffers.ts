import type { BufferedBitmap } from '../surface.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import {
  omniAngles,
  planAnimationFrame,
  planDirectionalFrame,
  planOmni,
  planStatic,
  type BufferPlan,
  type BufferScale,
} from './clipPlans.ts';

export class ClipBuffers {
  private readonly cache = new Map<string, BufferedBitmap | null>();
  private currentResolution = 1;

  constructor(private readonly renderer: SymbolRenderer) {}

  get size(): number {
    return this.cache.size;
  }

  get resolution(): number {
    return this.currentResolution;
  }

  setResolution(resolution: number): void {
    if (resolution === this.currentResolution) return;
    this.currentResolution = resolution;
    this.cache.clear();
  }

  staticClip(symbol: string): BufferedBitmap | undefined {
    return this.cached(`s|${symbol}`, (id) => planStatic(this.renderer.library, id, this.currentResolution), symbol);
  }

  animationFrame(symbol: string, frame: number): BufferedBitmap | undefined {
    return this.cached(`a|${symbol}|${frame}`, (id) => planAnimationFrame(this.renderer.library, id, frame, this.currentResolution), symbol);
  }

  directionalFrame(symbol: string, directions: number, direction: number, frame: number, scale: BufferScale): BufferedBitmap | undefined {
    const key = `d|${symbol}|${directions}|${direction}|${frame}|${scale.x}|${scale.y}`;
    return this.cached(key, (id) => planDirectionalFrame(this.renderer.library, id, directions, direction, frame, scale, this.currentResolution), symbol);
  }

  omniFrame(symbol: string, directions: number, index: number): BufferedBitmap | undefined {
    const angle = omniAngles(directions)[index];
    if (angle === undefined) return undefined;
    return this.cached(`o|${symbol}|${directions}|${index}`, (id) => planOmni(this.renderer.library, id, angle, this.currentResolution), symbol);
  }

  render(plan: BufferPlan): BufferedBitmap {
    const surface = this.renderer.createSurface(plan.layout.width, plan.layout.height);
    const options = { resolution: plan.resolution };
    this.renderer.draw(surface.ctx, plan.characterId, plan.frame, plan.layout.matrix, plan.overrides ? { ...options, overrides: plan.overrides } : options);
    return { surface, dispX: plan.layout.dispX, dispY: plan.layout.dispY };
  }

  private cached(key: string, planFor: (characterId: number) => BufferPlan, symbol: string): BufferedBitmap | undefined {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit ?? undefined;
    const characterId = this.renderer.library.characterId(symbol);
    const bitmap = characterId === undefined ? null : this.render(planFor(characterId));
    this.cache.set(key, bitmap);
    return bitmap ?? undefined;
  }
}
