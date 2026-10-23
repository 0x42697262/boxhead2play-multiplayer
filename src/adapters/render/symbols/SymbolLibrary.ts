import type { Button, DisplayItem, EditText, Filter, Graphic, Sprite, SymbolsCatalog } from '../../assets/schemas.ts';
import { IDENTITY, multiply, type Matrix } from '../geometry/Matrix.ts';
import { transformRect, union, type Rect } from '../geometry/Rect.ts';

export const ButtonState = {
  Up: 'up',
  Over: 'over',
  Down: 'down',
  HitTest: 'hitTest',
} as const;

export type ButtonState = (typeof ButtonState)[keyof typeof ButtonState];

export interface ChildOverride {
  readonly frame?: number;
  readonly matrix?: Matrix;
  readonly visible?: boolean;
  readonly alpha?: number;
  readonly text?: string;
  readonly textColor?: number;
  readonly letterSpacing?: number;
  readonly children?: Overrides;
  readonly characterId?: number;
  readonly attach?: readonly DisplayItem[];
  readonly filters?: readonly Filter[];
  readonly buttonState?: ButtonState;
  readonly clip?: Rect;
}

export type Overrides = Readonly<Record<string, ChildOverride>>;

export interface ResolvedInstance {
  readonly item: DisplayItem;
  readonly own: ChildOverride | undefined;
  readonly matrix: Matrix;
  readonly visible: boolean;
}

export const BUTTON_UP = ButtonState.Up;
export const BUTTON_HIT = ButtonState.HitTest;
const DEFAULT_RATIO = 0;

function byDepth(first: DisplayItem, second: DisplayItem): number {
  return first.depth - second.depth;
}

export type Character =
  | { readonly kind: 'graphic'; readonly graphic: Graphic }
  | { readonly kind: 'morph'; readonly ratios: Readonly<Record<string, Graphic>> }
  | { readonly kind: 'editText'; readonly editText: EditText }
  | { readonly kind: 'button'; readonly button: Button }
  | { readonly kind: 'sprite'; readonly sprite: Sprite };

export function childOverride(overrides: Overrides | undefined, item: DisplayItem): ChildOverride | undefined {
  return item.name === undefined ? undefined : overrides?.[item.name];
}

export function withReplacements(items: readonly DisplayItem[], overrides: Overrides | undefined): readonly DisplayItem[] {
  const replaced = (item: DisplayItem): number | undefined => {
    const replacement = childOverride(overrides, item)?.characterId;
    return replacement === item.characterId ? undefined : replacement;
  };
  if (!overrides || !items.some((item) => replaced(item) !== undefined)) return items;
  return items.map((item) => {
    const replacement = replaced(item);
    return replacement === undefined ? item : { ...item, characterId: replacement };
  });
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

  composedItems(characterId: number, frame: number, own: ChildOverride | undefined): readonly DisplayItem[] {
    const base = this.frameItems(characterId, frame);
    const attached = own?.attach ?? [];
    const merged = attached.length === 0 ? base : [...base.filter((item) => !attached.some((extra) => extra.depth === item.depth)), ...attached].sort(byDepth);
    return withReplacements(merged, own?.children);
  }

  resolve(rootItems: readonly DisplayItem[], path: readonly string[], overrides: Overrides | undefined, matrix: Matrix = IDENTITY): ResolvedInstance | undefined {
    let items = withReplacements(rootItems, overrides);
    let parentOverrides = overrides;
    let parentMatrix = matrix;
    let visible = true;
    let found: ResolvedInstance | undefined;
    for (const name of path) {
      const item = items.find((child) => child.name === name);
      if (!item) return undefined;
      const own = childOverride(parentOverrides, item);
      parentMatrix = multiply(parentMatrix, own?.matrix ?? item.matrix);
      visible &&= (own?.visible ?? item.visible ?? true) && this.sprite(item.characterId)?.selfHidden !== true;
      found = { item, own, matrix: parentMatrix, visible };
      items = this.composedItems(item.characterId, own?.frame ?? 0, own);
      parentOverrides = own?.children;
    }
    return found;
  }

  hitBounds(characterId: number, own: ChildOverride | undefined): Rect | null {
    const character = this.character(characterId);
    if (character?.kind !== 'button') return this.instanceBounds(characterId, own, DEFAULT_RATIO);
    return this.buttonStateBounds(character.button, BUTTON_HIT);
  }

  private buttonStateBounds(button: Button, state: ButtonState): Rect | null {
    let bounds: Rect | null = null;
    for (const record of button.records) {
      if (!record.states.includes(state)) continue;
      const local = this.localBounds(record.characterId);
      if (local) bounds = union(bounds, transformRect(local, record.matrix));
    }
    return bounds;
  }

  morphGraphic(ratios: Readonly<Record<string, Graphic>>, ratio: number): Graphic | undefined {
    return ratios[String(ratio)] ?? ratios[String(DEFAULT_RATIO)];
  }

  localBounds(characterId: number, frame = 0, overrides?: Overrides, ratio = DEFAULT_RATIO): Rect | null {
    return this.instanceBounds(characterId, overrides ? { frame, children: overrides } : { frame }, ratio);
  }

  instanceBounds(characterId: number, own: ChildOverride | undefined, ratio = DEFAULT_RATIO): Rect | null {
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
        return own?.buttonState === undefined || own.buttonState === BUTTON_UP ? character.button.bounds : this.buttonStateBounds(character.button, own.buttonState);
      case 'sprite':
        return this.spriteBounds(characterId, character.sprite, own);
    }
  }

  private spriteBounds(characterId: number, sprite: Sprite, own: ChildOverride | undefined): Rect | null {
    const index = clampFrame(sprite, own?.frame ?? 0);
    if (!own || (!own.children && !own.attach)) return sprite.frameBounds[index] ?? null;
    let bounds: Rect | null = null;
    for (const item of this.composedItems(characterId, index, own)) {
      const override = childOverride(own.children, item);
      const child = this.instanceBounds(item.characterId, override, item.ratio ?? DEFAULT_RATIO);
      if (child) bounds = union(bounds, transformRect(child, override?.matrix ?? item.matrix));
    }
    return bounds;
  }
}
