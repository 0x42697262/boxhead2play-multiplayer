import { describe, expect, it } from 'vitest';
import { clipFrameCountOf, toAnimationCatalog, toModelPoints, toRoomDefinition } from '../../../src/adapters/assets/mapping.ts';
import { ModelPoint, sourceFrame } from '../../../src/domain/animation/AnimationCatalog.ts';
import { ClipSymbol } from '../../../src/domain/things/clipVisual.ts';
import { DEVIL_COLLECTION, PLAYER_COLLECTION, ZOMBIE_COLLECTION } from '../../../src/domain/things/creatures/characterCollections.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { assetAnimMeta, assetRoomFile, assetsMissing, assetSymbols } from './support.ts';

describe('asset mapping', () => {
  it('renames XSI anchor names to model points', () => {
    const points = toModelPoints({ Hand_Right: { x: 1, y: 2, z: 3 }, GunPosition_Right: { x: 4, y: 5, z: 6 } });
    expect(points).toEqual({ [ModelPoint.HandRight]: { x: 1, y: 2, z: 3 }, [ModelPoint.GunPositionRight]: { x: 4, y: 5, z: 6 } });
  });

  it.skipIf(assetsMissing)('maps ROOM_Single_0001 to a room definition in pixels', () => {
    const room = toRoomDefinition(assetRoomFile('ROOM_Single_0001'));
    expect(room.widthPx).toBe(704);
    expect(room.heightPx).toBe(544);
    expect(room.initObjects.some((init) => init.kind === InitKind.Player1)).toBe(true);
    const solid = room.initObjects.find((init) => init.kind === InitKind.CollisionSolid);
    expect(solid?.position2Px.x).toBeGreaterThan(solid?.positionPx.x ?? Infinity);
  });

  it.skipIf(assetsMissing)('builds an animation catalog covering every collection and clip symbol', () => {
    const catalog = toAnimationCatalog(assetAnimMeta(), assetSymbols());
    expect(catalog.modelScale).toBe(0.35);
    for (const collection of [PLAYER_COLLECTION, ZOMBIE_COLLECTION, DEVIL_COLLECTION]) {
      for (const setId of Object.values(collection)) expect(catalog.characters[setId], setId).toBeDefined();
    }
    for (const symbol of Object.values(ClipSymbol)) expect(catalog.clips[symbol], symbol).toBeDefined();
    const walk = catalog.characters.Player_Walk;
    expect(walk?.frameCount).toBe(8);
    expect(walk?.directionCount).toBe(8);
    expect(walk && sourceFrame(walk, 5)).toBe(3);
    expect(walk?.modelPoints[0]?.[0]?.handRight).toBeDefined();
  });

  it.skipIf(assetsMissing)('counts the frames of the _Contents child like Buffer does', () => {
    const symbols = assetSymbols();
    expect(clipFrameCountOf(symbols, symbols.exports['Effect.BloodSplat'] ?? -1)).toBe(4);
    expect(clipFrameCountOf(symbols, symbols.exports['Effect.Explosion'] ?? -1)).toBe(18);
    expect(clipFrameCountOf(symbols, symbols.exports['Effect.FireBall'] ?? -1)).toBe(16);
    expect(clipFrameCountOf(symbols, symbols.exports['Object.Wall'] ?? -1)).toBe(10);
  });
});
