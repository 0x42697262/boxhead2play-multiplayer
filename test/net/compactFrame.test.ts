import { describe, expect, it } from 'vitest';
import type { AnimationCatalog } from '../../src/domain/animation/AnimationCatalog.ts';
import { DecalKind, DomainEventType, type DecalRequested } from '../../src/domain/events.ts';
import { DecalSymbol } from '../../src/domain/map/MapDecals.ts';
import { DECAL_DIRECTIONS, DECAL_SCALE_X, DECAL_SCALE_Y } from '../../src/domain/map/tuning.ts';
import { CHARACTER_STYLE_SCALES, CharacterStyle, ClipMode, OPAQUE_ALPHA, VisualKind, VisualLayer, type DrawEntry } from '../../src/domain/visuals.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { Difficulty, GameAmount, GameSpeed } from '../../src/domain/world/SimulationSettings.ts';
import { compactDecal, compactEntry, expandDecal, expandEntry, expandFrame } from '../../src/net/compactFrame.ts';
import { Match } from '../../src/server/Match.ts';
import { loadGameContent } from '../../src/server/node/content.ts';
import { assetsMissing } from '../adapters/assets/support.ts';

const WALK = 'Zombie_Zombie_Walk';
const SEQUENCE = [0, 0, 1, 1, 2];
const ANIMATIONS: AnimationCatalog = {
  modelScale: 1,
  characters: { [WALK]: { directionCount: 8, frameCount: SEQUENCE.length, frameSequence: SEQUENCE, tiltDegrees: 0, modelPoints: [] } },
  clips: {},
};
const AT = { x: 11.5, y: 0.68, z: 0 };

function zombie(frame: number): DrawEntry {
  return {
    thingKey: 't1',
    sortFloor: false,
    position: AT,
    visual: {
      kind: VisualKind.Character,
      layer: VisualLayer.World,
      style: CharacterStyle.Zombie,
      styleScale: CHARACTER_STYLE_SCALES[CharacterStyle.Zombie],
      animation: WALK,
      direction: 2,
      directionCount: 8,
      frame,
      sourceFrame: SEQUENCE[frame] ?? frame,
      alpha: OPAQUE_ALPHA,
      position: AT,
    },
  };
}

function clip(position: DrawEntry['position']): DrawEntry {
  return {
    thingKey: 't2',
    sortFloor: true,
    position: AT,
    visual: { kind: VisualKind.Clip, layer: VisualLayer.World, mode: ClipMode.Animation, symbol: 'Effect.Smoke', frame: 3, scale: 1, alpha: OPAQUE_ALPHA, position },
  };
}

const DECAL: DecalRequested = {
  type: DomainEventType.DecalRequested,
  decal: DecalKind.BloodSplat,
  symbol: DecalSymbol.BloodSplat,
  xPx: 100.25,
  yPx: 40.5,
  frame: 2,
  rotationIndex: 1,
  rotationCount: DECAL_DIRECTIONS,
  scaleX: DECAL_SCALE_X,
  scaleY: DECAL_SCALE_Y,
};

describe('compact frames', () => {
  it('sends a character without its duplicate position and the fields the client derives, and restores them exactly', () => {
    const compact = compactEntry(zombie(3));
    expect(compact.visual).not.toHaveProperty('position');
    expect(compact.visual).not.toHaveProperty('sourceFrame');
    expect(compact.visual).not.toHaveProperty('directionCount');
    expect(compact.visual).not.toHaveProperty('styleScale');
    expect(expandEntry(compact, ANIMATIONS)).toEqual(zombie(3));
  });

  it('keeps a clip position only when it differs from the entry position', () => {
    expect(compactEntry(clip(AT)).visual).not.toHaveProperty('position');
    const offset = { x: 12, y: 1, z: 0.5 };
    expect(compactEntry(clip(offset)).visual).toHaveProperty('position', offset);
    expect(expandEntry(compactEntry(clip(AT)), ANIMATIONS)).toEqual(clip(AT));
    expect(expandEntry(compactEntry(clip(offset)), ANIMATIONS)).toEqual(clip(offset));
  });

  it('sends a decal without its default symbol, rotation count and scale, and keeps values that differ', () => {
    const compact = compactDecal(DECAL);
    expect(Object.keys(compact).sort()).toEqual(['decal', 'frame', 'rotationIndex', 'type', 'xPx', 'yPx']);
    expect(expandDecal(compact)).toEqual(DECAL);
    const unusual = { ...DECAL, symbol: 'Effect.Other', scaleY: 2 };
    expect(expandDecal(compactDecal(unusual))).toEqual(unusual);
  });

  it.skipIf(assetsMissing)('restores every frame of a real coop match to the full draw list and events', async () => {
    const content = await loadGameContent('public/assets');
    const options = { difficulty: Difficulty.Nightmare, gameSpeed: GameSpeed.Normal, devilsActive: true, collisionsActive: true, damageActive: true, gameAmount: GameAmount.Kills10, detail: true };
    const match = Match.start({ id: 'm', mode: GameMode.Coop, roomId: 'ROOM_Single_0001', options, characters: [0, 1], seed: 3 }, content);
    if (!match) throw new Error('room missing');
    const world = (match as unknown as { world: { drawList(camera: unknown): DrawEntry[]; cameraFor(index: number): unknown } }).world;
    let checked = 0;
    for (let tick = 0; tick < 300; tick++) {
      const step = match.step();
      const frame = step.frames.get(0);
      if (!frame) continue;
      expect(expandFrame(frame, content.animations).entries).toEqual(world.drawList(world.cameraFor(0)));
      checked += frame.entries.length;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
