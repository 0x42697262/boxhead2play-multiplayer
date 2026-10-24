import type { KeyboardState } from '../../adapters/input/KeyboardState.ts';
import { TOUCH_CODES, TouchCode } from '../../adapters/input/touchCodes.ts';
import { t } from '../../text/i18n.ts';
import type { TextKey } from '../../text/i18n.ts';
import { Glyph, GLYPH_VIEW_BOX } from './glyphs.ts';
import { knobOffset, STICK_IDLE, stickDirections, type StickDirections } from './stick.ts';
import { TouchLayout } from '../../services/ScreenFlow.ts';
import {
  CONTROL_GAP_PX,
  CONTROL_MARGIN_PX,
  FIRE_BUTTON_PX,
  HAPTIC_TAP_MS,
  STICK_BASE_PX,
  STICK_GRAB_RADIUS_FACTOR,
  STICK_KNOB_PX,
  STICK_TRAVEL_PX,
  SYSTEM_BUTTON_PX,
  WEAPON_BUTTON_PX,
} from './tuning.ts';

export const TouchClass = {
  Root: 'touch',
  System: 'touch-system',
  Button: 'touch-button',
  Glyph: 'touch-glyph',
  PlayOnly: 'touch-play-only',
  Zone: 'touch-stick-zone',
  Base: 'touch-stick-base',
  Knob: 'touch-stick-knob',
  Actions: 'touch-actions',
  Weapons: 'touch-weapons',
  Fire: 'touch-fire',
  Weapon: 'touch-weapon',
  Pressed: 'touch-pressed',
  Dragging: 'touch-dragging',
} as const;

export interface TouchControlsDependencies {
  readonly document: Document;
  readonly keyboard: KeyboardState;
  readonly toggleMenu: () => void;
  readonly vibrate: (durationMs: number) => void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT_ATTRIBUTE = 'layout';
const STICK_KEYS: readonly (readonly [keyof StickDirections, TouchCode])[] = [
  ['up', TouchCode.Up],
  ['down', TouchCode.Down],
  ['left', TouchCode.Left],
  ['right', TouchCode.Right],
];
const SIZES: Readonly<Record<string, number>> = {
  '--touch-stick-base': STICK_BASE_PX,
  '--touch-stick-knob': STICK_KNOB_PX,
  '--touch-fire': FIRE_BUTTON_PX,
  '--touch-weapon': WEAPON_BUTTON_PX,
  '--touch-system': SYSTEM_BUTTON_PX,
  '--touch-margin': CONTROL_MARGIN_PX,
  '--touch-gap': CONTROL_GAP_PX,
};

function center(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export class TouchControls {
  readonly root: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly menuGlyph: SVGSVGElement;
  private readonly menuButton: HTMLButtonElement;
  private layout: TouchLayout = TouchLayout.Hidden;
  private shown: TouchLayout = TouchLayout.Hidden;
  private stickPointer: number | undefined = undefined;
  private origin: Point = { x: 0, y: 0 };
  private directions: StickDirections = STICK_IDLE;

  constructor(
    private readonly deps: TouchControlsDependencies,
    private touchInput: boolean,
  ) {
    const { document } = deps;
    this.root = this.element('div', TouchClass.Root);
    for (const [name, value] of Object.entries(SIZES)) this.root.style.setProperty(name, `${value}px`);
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());
    const system = this.element('div', TouchClass.System);
    this.menuButton = this.button([TouchClass.Button], 'touch.menu', Glyph.Pause);
    this.menuGlyph = this.menuButton.querySelector('svg') ?? document.createElementNS(SVG_NS, 'svg');
    this.menuButton.addEventListener('pointerup', (event) => {
      event.preventDefault();
      this.tap();
      deps.toggleMenu();
    });
    const list = this.holdButton(this.button([TouchClass.Button, TouchClass.PlayOnly], 'touch.list', Glyph.List), TouchCode.UpgradeList);
    system.append(this.menuButton, list);
    this.zone = this.element('div', `${TouchClass.Zone} ${TouchClass.PlayOnly}`);
    this.zone.setAttribute('aria-label', t('touch.move'));
    this.base = this.element('div', TouchClass.Base);
    this.knob = this.element('div', TouchClass.Knob);
    this.base.append(this.knob);
    this.zone.append(this.base);
    this.attachStick();
    const actions = this.element('div', `${TouchClass.Actions} ${TouchClass.PlayOnly}`);
    const weapons = this.element('div', TouchClass.Weapons);
    weapons.append(
      this.holdButton(this.button([TouchClass.Button, TouchClass.Weapon], 'touch.prevWeapon', Glyph.Previous), TouchCode.PrevWeapon),
      this.holdButton(this.button([TouchClass.Button, TouchClass.Weapon], 'touch.nextWeapon', Glyph.Next), TouchCode.NextWeapon),
    );
    actions.append(weapons, this.holdButton(this.button([TouchClass.Button, TouchClass.Fire], 'touch.fire', Glyph.Fire), TouchCode.Fire));
    this.root.append(system, this.zone, actions);
    document.body.append(this.root);
    this.render();
  }

  setTouchInput(touch: boolean): void {
    if (touch === this.touchInput) return;
    this.touchInput = touch;
    this.render();
  }

  show(layout: TouchLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.render();
  }

  get visibleLayout(): TouchLayout {
    return this.shown;
  }

  private render(): void {
    const shown = this.touchInput ? this.layout : TouchLayout.Hidden;
    if (shown !== TouchLayout.Play) this.releaseAll();
    this.shown = shown;
    this.root.dataset[LAYOUT_ATTRIBUTE] = shown;
    const glyph = shown === TouchLayout.Menu ? Glyph.Close : Glyph.Pause;
    this.menuGlyph.replaceChildren(...this.paths(glyph));
    this.menuButton.setAttribute('aria-label', t(shown === TouchLayout.Menu ? 'touch.close' : 'touch.menu'));
  }

  private releaseAll(): void {
    for (const code of TOUCH_CODES) this.deps.keyboard.keyUp(code);
    for (const pressed of this.root.querySelectorAll(`.${TouchClass.Pressed}`)) pressed.classList.remove(TouchClass.Pressed);
    this.endStick();
  }

  private attachStick(): void {
    this.zone.addEventListener('pointerdown', (event) => {
      if (this.stickPointer !== undefined) return;
      event.preventDefault();
      this.zone.setPointerCapture(event.pointerId);
      this.stickPointer = event.pointerId;
      const rest = center(this.base.getBoundingClientRect());
      const grab = Math.hypot(event.clientX - rest.x, event.clientY - rest.y) <= (STICK_BASE_PX / 2) * STICK_GRAB_RADIUS_FACTOR;
      this.origin = grab ? rest : { x: event.clientX, y: event.clientY };
      this.base.style.transform = `translate(${this.origin.x - rest.x}px, ${this.origin.y - rest.y}px)`;
      this.base.classList.add(TouchClass.Dragging);
      this.moveStick(event);
    });
    this.zone.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.stickPointer) this.moveStick(event);
    });
    const end = (event: PointerEvent): void => {
      if (event.pointerId === this.stickPointer) this.endStick();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);
  }

  private moveStick(event: PointerEvent): void {
    const dx = event.clientX - this.origin.x;
    const dy = event.clientY - this.origin.y;
    const knob = knobOffset(dx, dy, STICK_TRAVEL_PX);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
    this.applyDirections(stickDirections(dx, dy, STICK_TRAVEL_PX));
  }

  private endStick(): void {
    this.stickPointer = undefined;
    this.base.style.transform = '';
    this.knob.style.transform = '';
    this.base.classList.remove(TouchClass.Dragging);
    this.applyDirections(STICK_IDLE);
  }

  private applyDirections(next: StickDirections): void {
    for (const [direction, code] of STICK_KEYS) {
      if (next[direction] === this.directions[direction]) continue;
      if (next[direction]) this.deps.keyboard.keyDown(code);
      else this.deps.keyboard.keyUp(code);
    }
    this.directions = next;
  }

  private holdButton(button: HTMLButtonElement, code: TouchCode): HTMLButtonElement {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add(TouchClass.Pressed);
      this.tap();
      this.deps.keyboard.keyDown(code);
    });
    const release = (): void => {
      button.classList.remove(TouchClass.Pressed);
      this.deps.keyboard.keyUp(code);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    return button;
  }

  private tap(): void {
    this.deps.vibrate(HAPTIC_TAP_MS);
  }

  private button(classes: readonly string[], label: TextKey, glyph: Glyph): HTMLButtonElement {
    const button = this.element('button', classes.join(' '));
    button.type = 'button';
    button.setAttribute('aria-label', t(label));
    const svg = this.deps.document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', TouchClass.Glyph);
    svg.setAttribute('viewBox', GLYPH_VIEW_BOX);
    svg.setAttribute('aria-hidden', 'true');
    svg.append(...this.paths(glyph));
    button.append(svg);
    return button;
  }

  private paths(glyph: Glyph): SVGPathElement[] {
    return glyph.map((d) => {
      const path = this.deps.document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      return path;
    });
  }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const created = this.deps.document.createElement(tag);
    created.className = className;
    return created;
  }
}
