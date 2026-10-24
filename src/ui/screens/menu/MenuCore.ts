import type { SoundMixer } from '../../../adapters/audio/SoundMixer.ts';
import type { LayeredStage, StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { hitAreaContains, instanceHitArea } from '../../../adapters/render/symbols/hitTest.ts';
import type { SymbolRenderer } from '../../../adapters/render/symbols/SymbolRenderer.ts';
import { Cursor, type PointerInput, type StagePoint } from '../../../services/ScreenFlow.ts';
import type { Shell } from '../../shell/Shell.ts';
import { MenuPointer, type MenuTarget } from './MenuPointer.ts';
import { ScreenTransition } from './ScreenTransition.ts';

export interface MenuKit {
  readonly shell: Shell;
  readonly renderer: SymbolRenderer;
  readonly stage: LayeredStage;
  readonly audio: SoundMixer;
}

export function sceneHitTest<Action>(
  library: SymbolRenderer['library'],
  scene: StageScene,
  targets: readonly MenuTarget<Action>[],
): (point: StagePoint) => MenuTarget<Action> | undefined {
  return (point) =>
    targets.find((target) => {
      const area = instanceHitArea(library, scene.items, target.path, scene.overrides);
      return area !== undefined && hitAreaContains(area, point);
    });
}

function snapshot(kit: MenuKit): ScreenTransition {
  const surface = kit.renderer.createSurface(kit.shell.canvas.width, kit.shell.canvas.height);
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
    const { shell } = this.kit;
    this.kit.stage.setResolution(shell.resolution);
    const stage = this.kit.stage.render(scene);
    this.transition.draw(shell.ctx, stage.canvas, shell.canvas);
  }

  hitTest(scene: StageScene, targets: readonly MenuTarget<Action>[]): (point: StagePoint) => MenuTarget<Action> | undefined {
    return sceneHitTest(this.kit.renderer.library, scene, targets);
  }
}
