import type { KeyboardState } from '../adapters/input/KeyboardState.ts';
import { PointerPhase, type ScreenFlow } from '../services/ScreenFlow.ts';
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
  readonly onGesture: (touch: boolean) => void;
  readonly onVisibility: (visible: boolean) => void;
  readonly onResize: () => void;
}

const FORM_TAGS: ReadonlySet<string> = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

const SINGLE_CHARACTER = 1;
const MOUSE = 'mouse';
const IOS_PINCH_EVENT = 'gesturestart';

function typedCharacter(event: KeyboardEvent): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  return event.key.length === SINGLE_CHARACTER ? event.key : undefined;
}

function typingInForm(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && FORM_TAGS.has(target.tagName);
}

export function attachListeners(targets: ListenerTargets, handlers: ListenerHandlers): void {
  const { window, document, canvas } = targets;
  window.addEventListener('keydown', (event) => {
    if (typingInForm(event)) return;
    handlers.onGesture(false);
    if (handlers.isGameKey(event.code)) event.preventDefault();
    if (!event.repeat && handlers.flow.key(event.code, typedCharacter(event))) event.preventDefault();
    handlers.keyboard.keyDown(event.code);
  });
  window.addEventListener('keyup', (event) => {
    if (handlers.isGameKey(event.code) && !typingInForm(event)) event.preventDefault();
    handlers.keyboard.keyUp(event.code);
  });
  window.addEventListener('blur', () => handlers.keyboard.releaseAll());
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === MOUSE) handlers.onGesture(false);
  });
  window.addEventListener('pointerup', (event) => handlers.onGesture(event.pointerType !== MOUSE));
  document.addEventListener(IOS_PINCH_EVENT, (event) => event.preventDefault());
  window.addEventListener('resize', handlers.onResize);
  window.visualViewport?.addEventListener('resize', handlers.onResize);
  window.visualViewport?.addEventListener('scroll', handlers.onResize);
  const pointer = (phase: PointerPhase) => (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    handlers.flow.pointer({
      phase,
      point: {
        x: ((event.clientX - rect.left) / rect.width) * targets.stageWidth,
        y: ((event.clientY - rect.top) / rect.height) * targets.stageHeight,
      },
    });
  };
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointer(PointerPhase.Down)(event);
  });
  canvas.addEventListener('pointerup', pointer(PointerPhase.Up));
  canvas.addEventListener('pointermove', pointer(PointerPhase.Move));
  canvas.addEventListener('pointerleave', pointer(PointerPhase.Leave));
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
