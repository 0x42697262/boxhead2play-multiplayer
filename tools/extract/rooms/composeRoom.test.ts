import { describe, expect, it } from 'vitest';
import { matrix, place, rect, shape, SHOW_FRAME, sprite, swfIndex, translate } from '../testing/fixtures.ts';
import { composeRoom, initKindOf, RoomError } from './composeRoom.ts';

const SOLID = 10;
const COVER = 11;
const PIECE = 12;
const PLAYER2 = 13;
const SIZE = 14;
const ROOM = 20;

const index = swfIndex(
  [
    shape(1, rect(0, 0, 32, 32)),
    shape(2, rect(0, 0, 64, 10)),
    shape(3, rect(0, -5, 64, 64)),
    shape(4, rect(0, 0, 640, 480)),
    shape(5, rect(0, 0, 1000, 1000)),
    sprite(SOLID, [place(1, 1), SHOW_FRAME]),
    sprite(COVER, [place(1, 2), SHOW_FRAME]),
    sprite(PIECE, [
      place(3, 3),
      place(4, COVER, { matrix: translate(0, -5), name: '_Cover' }),
      place(7, SOLID, { matrix: matrix(2, 0, 0, 2, -32, -32) }),
      SHOW_FRAME,
    ]),
    sprite(PLAYER2, [place(1, 1), SHOW_FRAME]),
    sprite(SIZE, [place(1, 4), SHOW_FRAME]),
    sprite(ROOM, [
      place(1, 5),
      place(5, PIECE, { matrix: translate(288, 64) }),
      place(9, PLAYER2, { matrix: matrix(0, -1, 1, 0, 350.15, 436.05) }),
      place(20, SIZE, { matrix: matrix(1.1, 0, 0, 1, 0, 0), name: '_Size' }),
      SHOW_FRAME,
    ]),
  ],
  { World_Init_CollisionSolid: SOLID, 'Piece.Test': PIECE, World_Init_Player2: PLAYER2, ROOM_Single_0001: ROOM },
);

const context = {
  index,
  classes: new Map([
    ['World_Init_CollisionSolid', 'World.Init.CWorld_Init_CollisionSolid'],
    ['Piece.Test', 'World.Init.CWorld_Init_Piece'],
    ['World_Init_Player2', 'World.Init.CWorld_Init_Player2'],
  ]),
  selfHiddenSpriteIds: new Set([SIZE]),
};

describe('composeRoom', () => {
  const room = composeRoom(context, 'ROOM_Single_0001');

  it('registers init objects in construction order, parents before nested children', () => {
    expect(room.initObjects.map((init) => [init.kind, init.instancePath])).toEqual([
      ['Piece', [5]],
      ['CollisionSolid', [5, 7]],
      ['Player2', [9]],
    ]);
  });

  it('computes mPosition, mPosition2 and mAngle like CWorld_Init', () => {
    const [piece, solid, player] = room.initObjects;
    expect(piece?.position).toEqual({ x: 288, y: 64 });
    expect(solid?.position).toEqual({ x: 256, y: 32 });
    expect(solid?.position2).toEqual({ x: 320, y: 96 });
    expect(player?.position).toEqual({ x: 350.15, y: 436.05 });
    expect(player?.position2).toEqual({ x: 382.15, y: 468.05 });
    expect(player?.rotationDegrees).toBeCloseTo(-90);
  });

  it('describes piece floor and cover draws with translation only', () => {
    expect(room.pieces).toEqual([
      { order: 0, linkage: 'Piece.Test', characterId: PIECE, position: { x: 288, y: 64 }, coverCharacterId: COVER, coverPosition: { x: 288, y: 59 } },
    ]);
  });

  it('takes the room size from the transformed _Size clip and hides init and self-hiding clips', () => {
    expect(room.size).toEqual({ width: 704, height: 480 });
    expect(room.background.map((item) => item.characterId)).toEqual([5]);
    expect(room.hiddenCharacterIds).toEqual([SOLID, PIECE, PLAYER2, SIZE]);
  });

  it('rejects unknown rooms and init classes', () => {
    expect(() => composeRoom(context, 'ROOM_Single_0099')).toThrow(RoomError);
    expect(() => initKindOf('World.Init.CWorld_Init_Unknown')).toThrow(RoomError);
    expect(initKindOf('Screen.CScreen_Main')).toBeUndefined();
  });
});
