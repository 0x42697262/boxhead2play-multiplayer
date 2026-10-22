import { describe, expect, it } from 'vitest';
import { move, place, SHOW_FRAME, sprite, swfIndex } from '../testing/fixtures.ts';
import { RoomError } from './composeRoom.ts';
import { buildRoomIndex, roomLinkage } from './roomIndex.ts';

const ICONS = 30;

const index = swfIndex(
  [
    sprite(ICONS, [
      place(142, 101),
      place(145, 102),
      place(146, 103),
      SHOW_FRAME,
      move(142, { characterId: 104 }),
      move(146, { characterId: 105 }),
      SHOW_FRAME,
    ]),
  ],
  { LevelIcons_Single: ICONS, ROOM_Single_0001: 1, ROOM_Single_0002: 2 },
);

const texts = {
  '101': { text: 'BOXY' },
  '102': { text: '/18' },
  '103': { text: '1' },
  '104': { text: 'BUTTONS' },
  '105': { text: '2' },
};

describe('buildRoomIndex', () => {
  it('names rooms from the level icon frames and applies the exclusive tables', () => {
    const roomIndex = buildRoomIndex({ index, texts, exclusives: { single: [0, 1], coop: [1, 1], deathMatch: [0, 0] } });
    expect(roomIndex.rooms).toEqual([
      { index: 0, id: 'ROOM_Single_0001', file: 'ROOM_Single_0001.json', name: 'BOXY', iconFrame: 0, exclusive: { single: false, coop: true, deathMatch: false } },
      { index: 1, id: 'ROOM_Single_0002', file: 'ROOM_Single_0002.json', name: 'BUTTONS', iconFrame: 1, exclusive: { single: true, coop: true, deathMatch: false } },
    ]);
  });

  it('fails when a frame has no matching room', () => {
    const withoutRooms = swfIndex([sprite(ICONS, [place(1, 101), SHOW_FRAME])], { LevelIcons_Single: ICONS });
    expect(() => buildRoomIndex({ index: withoutRooms, texts, exclusives: { single: [], coop: [], deathMatch: [] } })).toThrow(RoomError);
  });

  it('pads room linkages to four digits', () => {
    expect(roomLinkage(17)).toBe('ROOM_Single_0018');
  });
});
