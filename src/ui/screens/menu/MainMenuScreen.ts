import type { DisplayItem, Filter } from '../../../adapters/assets/schemas.ts';
import { multiply, translation, type Matrix } from '../../../adapters/render/geometry/Matrix.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import type { ChildOverride, Overrides, SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { SoundId } from '../../../domain/sounds.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import type { Cursor, FlowControls, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import { wordCut } from './labelWord.ts';
import { MenuCore, type MenuKit } from './MenuCore.ts';
import { Trigger, type MenuTarget } from './MenuPointer.ts';
import { rollOverFilters } from './rollOver.ts';
import {
  MAIN_MENU_BACKGROUND_DEPTH,
  MAIN_MENU_TITLE_DEPTH,
  MainMenuChild,
  MENU_TICKS_PER_SECOND,
  MenuSymbol,
  PLAY_LABEL_INSTANCE,
  PLAY_LABEL_WORD_INDEX,
  ROLL_OUT_ALPHA,
  ROLL_OVER_ALPHA,
} from './tuning.ts';

export interface MainMenuDependencies {
  readonly kit: MenuKit;
  readonly rng: Rng;
  readonly controls: FlowControls;
}

export interface MainMenuLayout {
  readonly items: readonly DisplayItem[];
  readonly playLabel: ChildOverride | undefined;
}

export function itemMatrix(matrix: Matrix): DisplayItem['matrix'] {
  const [a, b, c, d, tx, ty] = matrix;
  return [a, b, c, d, tx, ty];
}

const NO_FILTERS: readonly Filter[] = [];
const MENU_BUTTONS = [MainMenuChild.SinglePlay, MainMenuChild.DeathPlay] as const;

const MAIN_MENU_TARGETS: readonly MenuTarget<GameMode>[] = [
  { path: [MainMenuChild.SinglePlay], trigger: Trigger.Release, action: GameMode.Single },
  { path: [MainMenuChild.DeathPlay], trigger: Trigger.Release, action: GameMode.DeathMatch },
];

function playLabelOverride(library: SymbolLibrary, singlePlay: DisplayItem): ChildOverride | undefined {
  const contents = library.findChild(singlePlay.characterId, MainMenuChild.Contents);
  if (!contents) return undefined;
  const label = library.frameItems(contents.characterId, 0).find((item) => library.catalog.texts[String(item.characterId)] !== undefined);
  const text = label ? library.catalog.texts[String(label.characterId)] : undefined;
  const cut = text?.glyphs ? wordCut(text.glyphs, text.bounds, PLAY_LABEL_WORD_INDEX) : undefined;
  if (!label || !cut) return undefined;
  return {
    attach: [{ ...label, name: PLAY_LABEL_INSTANCE, matrix: itemMatrix(multiply(label.matrix, translation(cut.offsetX, 0))) }],
    children: { [PLAY_LABEL_INSTANCE]: { clip: cut.clip } },
  };
}

export function mainMenuLayout(library: SymbolLibrary): MainMenuLayout {
  const rootId = library.characterId(MenuSymbol.Main);
  const items = rootId === undefined ? [] : library.frameItems(rootId, 0);
  const named = (name: string): DisplayItem | undefined => items.find((item) => item.name === name);
  const single = named(MainMenuChild.SinglePlay);
  const coop = named(MainMenuChild.CoopPlay);
  const death = named(MainMenuChild.DeathPlay);
  const kept = items.filter((item) => item.depth === MAIN_MENU_BACKGROUND_DEPTH || item.depth === MAIN_MENU_TITLE_DEPTH);
  const buttons = [single, death && coop ? { ...death, depth: coop.depth, matrix: coop.matrix } : death].filter((item): item is DisplayItem => item !== undefined);
  return {
    items: [...kept, ...buttons].sort((first, second) => first.depth - second.depth),
    playLabel: single ? playLabelOverride(library, single) : undefined,
  };
}

export class MainMenuScreen implements Screen {
  readonly name = 'mainMenu';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<GameMode>;
  private readonly layout: MainMenuLayout;
  private rolledOver: { readonly name: string; readonly filters: readonly Filter[] } | undefined = undefined;

  constructor(private readonly deps: MainMenuDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = mainMenuLayout(deps.kit.renderer.library);
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  tick(): void {
    this.core.tick(
      () => this.scene(),
      () => MAIN_MENU_TARGETS,
    );
    const hovered = this.core.pointer.hoveredTarget?.path[0];
    this.rolledOver = hovered === undefined ? undefined : { name: hovered, filters: rollOverFilters(this.deps.rng) };
  }

  present(): void {
    this.core.present(this.scene());
  }

  idle(): void {}

  pointer(input: PointerInput): void {
    const mode = this.core.handle(input, this.scene(), MAIN_MENU_TARGETS);
    if (this.core.pointer.hoveredTarget?.path[0] !== this.rolledOver?.name) this.rolledOver = undefined;
    if (mode === undefined) return;
    this.deps.kit.audio.play(SoundId.Click);
    this.deps.controls.selectWorld(mode);
  }

  key(): boolean {
    return false;
  }

  suspend(): void {}

  dispose(): void {}

  scene(): StageScene {
    const overrides: Record<string, ChildOverride> = {};
    for (const name of MENU_BUTTONS) {
      const rolled = this.rolledOver?.name === name ? this.rolledOver : undefined;
      const label = name === MainMenuChild.SinglePlay ? this.layout.playLabel : undefined;
      overrides[name] = {
        children: {
          [MainMenuChild.Contents]: {
            ...label,
            alpha: rolled ? ROLL_OVER_ALPHA : ROLL_OUT_ALPHA,
            filters: rolled?.filters ?? NO_FILTERS,
          },
        },
      };
    }
    return { items: this.layout.items, overrides: overrides as Overrides, expand: new Set() };
  }
}
