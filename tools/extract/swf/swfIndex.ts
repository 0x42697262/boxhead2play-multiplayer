import { MORPH_RATIO_MAX } from '../tuning.ts';
import { lerpRect, transformRect, unionRects } from './geometry.ts';
import { resolveTimeline, type DisplayObjectState, type ResolvedFrame } from './timeline.ts';
import type { CharacterDefinition, SwfDocument, TwipsRect } from './types.ts';

export const BUTTON_UP_STATE = 'up';

export class SwfIndex {
  private readonly timelines = new Map<number, ResolvedFrame[]>();
  private readonly frameBounds = new Map<string, TwipsRect | null>();
  private linkages: Map<number, string> | undefined;

  readonly document: SwfDocument;

  constructor(document: SwfDocument) {
    this.document = document;
  }

  linkageOf(id: number): string | undefined {
    if (this.linkages === undefined) {
      this.linkages = new Map();
      for (const [linkage, characterId] of this.document.exports) {
        if (!this.linkages.has(characterId)) this.linkages.set(characterId, linkage);
      }
    }
    return this.linkages.get(id);
  }

  character(id: number): CharacterDefinition | undefined {
    return this.document.characters.get(id);
  }

  timeline(spriteId: number): ResolvedFrame[] {
    const cached = this.timelines.get(spriteId);
    if (cached !== undefined) return cached;
    const sprite = spriteId === this.document.root.id ? this.document.root : this.character(spriteId);
    if (sprite === undefined || sprite.kind !== 'sprite') throw new Error(`Character ${spriteId} is not a sprite`);
    const frames = resolveTimeline(sprite);
    this.timelines.set(spriteId, frames);
    return frames;
  }

  characterBounds(id: number, ratio = 0): TwipsRect | null {
    const definition = this.character(id);
    if (definition === undefined) return null;
    switch (definition.kind) {
      case 'shape':
      case 'text':
      case 'editText':
        return definition.bounds;
      case 'morphShape':
        return lerpRect(definition.startBounds, definition.endBounds, ratio / MORPH_RATIO_MAX);
      case 'sprite':
        return this.spriteFrameBounds(id, 0);
      case 'button':
        return definition.records
          .filter((record) => record.states.includes(BUTTON_UP_STATE))
          .reduce<TwipsRect | null>((bounds, record) => {
            const local = this.characterBounds(record.characterId);
            return unionRects(bounds, local === null ? null : transformRect(record.matrix, local));
          }, null);
      default:
        return null;
    }
  }

  placedBounds(item: DisplayObjectState): TwipsRect | null {
    const local = this.characterBounds(item.characterId, item.ratio ?? 0);
    return local === null ? null : transformRect(item.matrix, local);
  }

  spriteFrameBounds(spriteId: number, frameIndex: number): TwipsRect | null {
    const key = `${spriteId}:${frameIndex}`;
    if (this.frameBounds.has(key)) return this.frameBounds.get(key) ?? null;
    this.frameBounds.set(key, null);
    const frame = this.timeline(spriteId)[frameIndex];
    const bounds = (frame?.displayList ?? []).reduce<TwipsRect | null>(
      (union, item) => unionRects(union, this.placedBounds(item)),
      null,
    );
    this.frameBounds.set(key, bounds);
    return bounds;
  }
}
