import { TouchLayout } from '../../services/ScreenFlow.ts';

const FULLSCREEN_TAP_LAYOUTS: ReadonlySet<TouchLayout> = new Set([TouchLayout.Hidden, TouchLayout.Menu]);

export function entersFullscreenOnTap(layout: TouchLayout = TouchLayout.Hidden): boolean {
  return FULLSCREEN_TAP_LAYOUTS.has(layout);
}
