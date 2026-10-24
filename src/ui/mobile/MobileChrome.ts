import { t } from '../../text/i18n.ts';
import { HOME_SCREEN_HINT_MS } from './tuning.ts';

export const MobileClass = {
  Rotate: 'mobile-rotate',
  RotateIcon: 'mobile-rotate-icon',
  RotateText: 'mobile-rotate-text',
  Hint: 'mobile-hint',
  HintText: 'mobile-hint-text',
  HintTitle: 'mobile-hint-title',
  HintBody: 'mobile-hint-body',
  HintClose: 'mobile-hint-close',
  Hidden: 'mobile-hidden',
} as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROTATE_ICON_PATHS = [
  'M20 8h24a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z',
  'M54 22a14 14 0 0 1 4 10',
  'M58 32l2.5-5M58 32l-5-2',
] as const;
const ROTATE_VIEW_BOX = '0 0 64 64';
const CLOSE_GLYPH = '\u2715';

function icon(document: Document, className: string, viewBox: string, paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

const HOME_SCREEN_TITLE_META = 'apple-mobile-web-app-title';

export function setHomeScreenTitle(document: Document): void {
  const meta = document.createElement('meta');
  meta.name = HOME_SCREEN_TITLE_META;
  meta.content = t('app.shortTitle');
  document.head.append(meta);
}

export function attachRotateHint(document: Document): HTMLElement {
  const rotate = element(document, 'div', MobileClass.Rotate);
  rotate.setAttribute('role', 'alert');
  rotate.append(icon(document, MobileClass.RotateIcon, ROTATE_VIEW_BOX, ROTATE_ICON_PATHS), element(document, 'p', MobileClass.RotateText, t('mobile.rotate')));
  document.body.append(rotate);
  return rotate;
}

export function attachHomeScreenHint(document: Document, schedule: (run: () => void, delayMs: number) => void): HTMLElement {
  const hint = element(document, 'div', MobileClass.Hint);
  hint.setAttribute('role', 'status');
  const text = element(document, 'div', MobileClass.HintText);
  text.append(element(document, 'strong', MobileClass.HintTitle, t('mobile.homeScreen.title')), element(document, 'span', MobileClass.HintBody, t('mobile.homeScreen.body')));
  const close = element(document, 'button', MobileClass.HintClose, CLOSE_GLYPH);
  close.type = 'button';
  close.setAttribute('aria-label', t('mobile.homeScreen.close'));
  const dismiss = (): void => hint.classList.add(MobileClass.Hidden);
  close.addEventListener('click', dismiss);
  hint.append(text, close);
  document.body.append(hint);
  schedule(dismiss, HOME_SCREEN_HINT_MS);
  return hint;
}
