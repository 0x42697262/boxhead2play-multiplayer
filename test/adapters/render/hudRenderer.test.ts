import { describe, expect, it } from 'vitest';
import { HudRenderer } from '../../../src/adapters/render/hud/HudRenderer.ts';
import { HudChild, HudSymbol } from '../../../src/adapters/render/hud/tuning.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { hudFrame } from './support/fixtures.ts';
import { placed, recordingRenderer, RecordingSurfaces, spriteOf, squareShape, symbolsCatalog } from './support/recordingSurfaces.ts';

const TIMER_FRAMES = 4;
const SCORE_TOTAL_ID = 10;
const SQUARE_ID = 11;
const TIMER_ID = 12;

function hud() {
  const surfaces = new RecordingSurfaces();
  const catalog = symbolsCatalog({
    exports: { [HudSymbol.ScoreTotal]: SCORE_TOTAL_ID },
    shapes: { [SQUARE_ID]: squareShape('square.svg') },
    sprites: {
      [SCORE_TOTAL_ID]: spriteOf([[placed(SQUARE_ID, 1, HudChild.ScoreText), placed(SQUARE_ID, 2, HudChild.MultiplierText), placed(TIMER_ID, 3, HudChild.Timer)]]),
      [TIMER_ID]: spriteOf(Array.from({ length: TIMER_FRAMES }, () => [placed(SQUARE_ID, 1)])),
    },
  });
  const renderer = new HudRenderer(recordingRenderer(catalog, surfaces), GameMode.Single);
  const target = surfaces.create(640, 480);
  const draw = (multiplierTickRatio: number, totalScore = 0): number => {
    const created = surfaces.created.length;
    renderer.drawBitmapLayer(target.ctx, hudFrame({ multiplierTickRatio, totalScore }), 0, 25);
    renderer.drawLive(target.ctx);
    return surfaces.created.length - created;
  };
  return { surfaces, renderer, draw };
}

describe('HUD bitmap cache', () => {
  it('renders the score total once while nothing changes', () => {
    const { draw } = hud();
    expect(draw(0)).toBeGreaterThan(0);
    expect(draw(0)).toBe(0);
  });

  it('renders the score total again at the new size after a resolution change', () => {
    const { surfaces, renderer, draw } = hud();
    draw(0);
    const before = surfaces.created.at(-1)?.width ?? 0;
    renderer.setResolution(2);
    expect(draw(0)).toBeGreaterThan(0);
    expect(surfaces.created.at(-1)?.width).toBe(before * 2);
    expect(draw(0)).toBe(0);
  });
});
