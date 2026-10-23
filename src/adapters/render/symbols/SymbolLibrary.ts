import type { Button, DisplayItem, EditText, Graphic, Sprite, SymbolsCatalog } from '../../assets/schemas.ts';
import type { Matrix } from '../geometry/Matrix.ts';
import { transformRect, union, type Rect } from '../geometry/Rect.ts';

export interface ChildOverride {
  readonly frame?: number;
  readonly matrix?: Matrix;
  readonly visible?: boolean;
  readonly alpha?: number;
  readonly text?: string;
  readonly textColor?: number;
  readonly letterSpacing?: number;
  readonly children?: Overrides;
}

export type Overrides = Readonly<Record<string, ChildOverride>>;

export const BUTTON_UP = 'up';
export const BUTTON_HIT = 'hitTest';
const DEFAULT_RATIO = 0;

export type Character =
  | { readonly kind: 'graphic'; readonly graphic: Graphic }
  | { readonly kind: 'morph'; readonly ratios: Readonly<Record<string, Graphic>> }
  | { readonly kind: 'editText'; readonly editText: EditText }
  | { readonly kind: 'button'; readonly button: Button }
  | { readonly kind: 'sprite'; readonly sprite: Sprite };

export function childOverride(overrides: Overrides | undefined, item: DisplayItem): ChildOverride | undefined {
  return item.name === undefined ? undefined : overrides?.[item.name];
}

export function clampFrame(sprite: Sprite, frame: number): number {
  return Math.min(Math.max(0, Math.trunc(frame)), Math.max(0, sprite.frameCount - 1));
}

export class SymbolLibrary {
  constructor(readonly catalog: SymbolsCatalog) {}

  characterId(linkage: string): number | undefined {
    return this.catalog.exports[linkage];
  }

  character(characterId: number): Character | undefined {
    const key = String(characterId);
    const shape = this.catalog.shapes[key] ?? this.catalog.texts[key];
    if (shape) return { kind: 'graphic', graphic: shape };
    const morph = this.catalog.morphShapes[key];
    if (morph) return { kind: 'morph', ratios: morph.ratios };
    const editText = this.catalog.editTexts[key];
    if (editText) return { kind: 'editText', editText };
    const button = this.catalog.buttons[key];
    if (button) return { kind: 'button', button };
    const sprite = this.catalog.sprites[key];
    if (sprite) return { kind: 'sprite', sprite };
    return undefined;
  }

  sprite(characterId: number): Sprite | undefined {
    return this.catalog.sprites[String(characterId)];
  }

  frameItems(characterId: number, frame: number): readonly DisplayItem[] {
    const sprite = this.sprite(characterId);
    return sprite ? (sprite.frames[clampFrame(sprite, frame)] ?? []) : [];
  }

  findChild(characterId: number, name: string, frame = 0): DisplayItem | undefined {
    return this.frameItems(characterId, frame).find((item) => item.name === name);
  }

  morphGraphic(ratios: Readonly<Record<string, Graphic>>, ratio: number): Graphic | undefined {
    return ratios[String(ratio)] ?? ratios[String(DEFAULT_RATIO)];
  }

  localBounds(characterId: number, frame = 0, overrides?: Overrides, ratio = DEFAULT_RATIO): Rect | null {
    const character = this.character(characterId);
    if (!character) return null;
    switch (character.kind) {
      case 'graphic':
        return character.graphic.bounds;
      case 'morph':
        return this.morphGraphic(character.ratios, ratio)?.bounds ?? null;
      case 'editText':
        return character.editText.bounds;
      case 'button':
        return character.button.bounds;
      case 'sprite':
        return this.spriteBounds(characterId, character.sprite, frame, overrides);
    }
  }

  private spriteBounds(characterId: number, sprite: Sprite, frame: number, overrides: Overrides | undefined): Rect | null {
    const index = clampFrame(sprite, frame);
    if (!overrides) return sprite.frameBounds[index] ?? null;
    let bounds: Rect | null = null;
    for (const item of this.frameItems(characterId, index)) {
      const override = childOverride(overrides, item);
      const child = this.localBounds(item.characterId, override?.frame ?? 0, override?.children, item.ratio ?? DEFAULT_RATIO);
      if (child) bounds = union(bounds, transformRect(child, override?.matrix ?? item.matrix));
    }
    return bounds;
  }
}
