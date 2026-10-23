import type { KeyboardState } from '../adapters/input/KeyboardState.ts';
import type { ScreenFlow } from '../services/ScreenFlow.ts';
import type { GameLoop } from './GameLoop.ts';

export interface ListenerTargets {
  readonly window: Window;
  readonly document: Document;
  readonly canvas: HTMLCanvasElement;
  readonly stageWidth: number;
  readonly stageHeight: number;
}

export interface ListenerHandlers {
  readonly keyboard: KeyboardState;
  readonly flow: ScreenFlow;
  readonly loop: GameLoop;
  readonly isGameKey: (code: string) => boolean;
  readonly onFirstGesture: () => void;
  readonly onVisibility: (visible: boolean) => void;
  readonly onResize: () => void;
}

const FORM_TAGS: ReadonlySet<string> = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

function typingInForm(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && FORM_TAGS.has(target.tagName);
}

export function attachListeners(targets: ListenerTargets, handlers: ListenerHandlers): void {
  const { window, document, canvas } = targets;
  let gestured = false;
  const gesture = (): void => {
    if (gestured) return;
    gestured = true;
    handlers.onFirstGesture();
  };
  window.addEventListener('keydown', (event) => {
    gesture();
    if (typingInForm(event)) return;
    if (handlers.isGameKey(event.code)) event.preventDefault();
    handlers.keyboard.keyDown(event.code);
  });
  window.addEventListener('keyup', (event) => {
    if (handlers.isGameKey(event.code) && !typingInForm(event)) event.preventDefault();
    handlers.keyboard.keyUp(event.code);
  });
  window.addEventListener('blur', () => handlers.keyboard.releaseAll());
  window.addEventListener('pointerdown', gesture);
  window.addEventListener('resize', handlers.onResize);
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    handlers.flow.pointer({
      x: ((event.clientX - rect.left) / rect.width) * targets.stageWidth,
      y: ((event.clientY - rect.top) / rect.height) * targets.stageHeight,
    });
  });
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (!visible) {
      handlers.keyboard.releaseAll();
      handlers.flow.suspend();
    } else {
      handlers.loop.resetTiming();
    }
    handlers.onVisibility(visible);
  });
}
