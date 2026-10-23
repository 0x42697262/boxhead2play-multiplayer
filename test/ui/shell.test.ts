import { describe, expect, it } from 'vitest';
import { prewarmCollections } from '../../src/adapters/render/xsi/collections.ts';
import { CharacterStyle } from '../../src/domain/visuals.ts';
import { DEFAULT_GAME_OPTIONS } from '../../src/domain/world/SimulationSettings.ts';
import { stageScale } from '../../src/ui/shell/Shell.ts';

describe('stage scaling', () => {
  it('uses whole multiples with pixelated rendering when the window is large enough', () => {
    expect(stageScale(1920, 1080)).toEqual({ scale: 2, pixelated: true });
    expect(stageScale(700, 500)).toEqual({ scale: 1, pixelated: true });
  });

  it('shrinks smoothly below 640 x 480', () => {
    expect(stageScale(320, 480)).toEqual({ scale: 0.5, pixelated: false });
  });
});

describe('XSI prewarm collections', () => {
  it('queue both player styles, the devil and the zombie like ProcessBGTasks', () => {
    const collections = prewarmCollections(DEFAULT_GAME_OPTIONS);
    expect(collections.map((collection) => collection.style)).toEqual([CharacterStyle.Bambo, CharacterStyle.Swat, CharacterStyle.Devil, CharacterStyle.Zombie]);
    expect(collections[2]?.styleScale).toBe(0.42);
    expect(collections[0]?.setIds).toContain('Player_Handgun_Walk');
  });
});
