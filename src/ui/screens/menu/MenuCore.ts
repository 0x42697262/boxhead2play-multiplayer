import type { SoundMixer } from '../../../adapters/audio/SoundMixer.ts';
import type { LayeredStage, StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { hitAreaContains, instanceHitArea } from '../../../adapters/render/symbols/hitTest.ts';
import type { SymbolRenderer } from '../../../adapters/render/symbols/SymbolRenderer.ts';
import { Cursor, type PointerInput, type StagePoint } from '../../../services/ScreenFlow.ts';
import { STAGE_HEIGHT_PX, STAGE_WIDTH_PX, type Shell } from '../../shell/Shell.ts';
import { MenuPointer, type MenuTarget } from './MenuPointer.ts';
import { ScreenTransition } from './ScreenTransition.ts';

export interface MenuKit {
  readonly shell: Shell;
  readonly renderer: SymbolRenderer;
  readonly stage: LayeredStage;
  readonly audio: SoundMixer;
}

function snapshot(kit: MenuKit): ScreenTransition {
  const surface = kit.renderer.createSurface(STAGE_WIDTH_PX, STAGE_HEIGHT_PX);
  surface.ctx.drawImage(kit.shell.canvas, 0, 0);
  return new ScreenTransition(surface);
}

export class MenuCore<Action> {
  readonly pointer = new MenuPointer<Action>();
  private readonly transition: ScreenTransition;

  constructor(private readonly kit: MenuKit) {
    this.transition = snapshot(kit);
    kit.shell.hideOverlay();
  }

  get interactive(): boolean {
    return this.transition.done;
  }

  get cursor(): Cursor {
    return this.interactive ? this.pointer.cursor : Cursor.Default;
  }

  tick(scene: () => StageScene, targets: () => readonly MenuTarget<Action>[]): void {
    if (this.transition.done) return;
    this.transition.tick();
    if (this.transition.done) this.pointer.refresh(this.hitTest(scene(), targets()));
  }

  handle(input: PointerInput, scene: StageScene, targets: readonly MenuTarget<Action>[]): Action | undefined {
    if (!this.interactive) {
      this.pointer.observe(input);
      return undefined;
    }
    return this.pointer.handle(input, this.hitTest(scene, targets));
  }

  refresh(scene: StageScene, targets: readonly MenuTarget<Action>[]): void {
    if (this.interactive) this.pointer.refresh(this.hitTest(scene, targets));
  }

  present(scene: StageScene): void {
    const stage = this.kit.stage.render(scene);
    this.transition.draw(this.kit.shell.ctx, stage.canvas);
  }

  hitTest(scene: StageScene, targets: readonly MenuTarget<Action>[]): (point: StagePoint) => MenuTarget<Action> | undefined {
    const library = this.kit.renderer.library;
    return (point) =>
      targets.find((target) => {
        const area = instanceHitArea(library, scene.items, target.path, scene.overrides);
        return area !== undefined && hitAreaContains(area, point);
      });
  }
}
