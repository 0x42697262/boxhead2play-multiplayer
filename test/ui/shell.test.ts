import { describe, expect, it } from 'vitest';
import { prewarmCollections } from '../../src/adapters/render/xsi/collections.ts';
import { CharacterStyle } from '../../src/domain/visuals.ts';
import { DEFAULT_GAME_OPTIONS } from '../../src/domain/world/SimulationSettings.ts';
import { GraphicsQuality } from '../../src/services/graphicsQuality.ts';
import { layoutFit, sharpResolution, stageFit } from '../../src/ui/shell/Shell.ts';

const viewport = (width: number, height: number, devicePixelRatio = 1) => ({ width, height, devicePixelRatio });

describe('stage fit per graphics quality', () => {
  it('sharp fills the window and renders at the device pixels per stage pixel, in quarter steps up to 3', () => {
    expect(stageFit(viewport(1920, 1080), GraphicsQuality.Sharp)).toEqual({ cssScale: 2.25, resolution: 2.25, pixelated: false });
    expect(stageFit(viewport(1280, 720, 2), GraphicsQuality.Sharp)).toEqual({ cssScale: 1.5, resolution: 3, pixelated: false });
    expect(sharpResolution(1.3)).toBe(1.5);
    expect(sharpResolution(0.5)).toBe(1);
    expect(sharpResolution(9)).toBe(3);
  });

  it('smooth fills the window from a 640 x 480 canvas', () => {
    expect(stageFit(viewport(1920, 1080, 2), GraphicsQuality.Smooth)).toEqual({ cssScale: 2.25, resolution: 1, pixelated: false });
  });

  it('pixelated uses whole multiples with hard pixels, and shrinks smoothly below 640 x 480', () => {
    expect(stageFit(viewport(1920, 1080), GraphicsQuality.Pixelated)).toEqual({ cssScale: 2, resolution: 1, pixelated: true });
    expect(stageFit(viewport(700, 500), GraphicsQuality.Pixelated)).toEqual({ cssScale: 1, resolution: 1, pixelated: true });
    expect(stageFit(viewport(320, 480), GraphicsQuality.Pixelated)).toEqual({ cssScale: 0.5, resolution: 1, pixelated: false });
  });
});

describe('layout fit during a resize', () => {
  it('follows the window size but keeps the current resolution until the resize settles', () => {
    expect(layoutFit(viewport(1920, 1080), GraphicsQuality.Sharp, 1.5)).toEqual({ cssScale: 2.25, resolution: 1.5, pixelated: false });
    expect(layoutFit(viewport(1920, 1080), GraphicsQuality.Pixelated, 1)).toEqual({ cssScale: 2, resolution: 1, pixelated: true });
  });
});

describe('XSI prewarm collections', () => {
  it('queue every distinct player style, the devil and the zombie like ProcessBGTasks', () => {
    const collections = prewarmCollections({ ...DEFAULT_GAME_OPTIONS, playerCharacters: [3, 0, 3] });
    expect(collections.map((collection) => collection.style)).toEqual([CharacterStyle.Bambo, CharacterStyle.Swat, CharacterStyle.Devil, CharacterStyle.Zombie]);
    expect(collections[2]?.styleScale).toBe(0.42);
    expect(collections[0]?.setIds).toContain('Player_Handgun_Walk');
  });
});
