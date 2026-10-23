import { describe, expect, it } from 'vitest';
import {
  floorSourceOrigin,
  omniIndex,
  roundedScreenPoint,
  splitScreenLayout,
  splitScreenMatrix,
  thingScreenPoint,
  viewSideFor,
} from '../../../src/adapters/render/world/projection.ts';
import { roomBitmapSize } from '../../../src/adapters/render/world/RoomPlanes.ts';
import { playerLabelText } from '../../../src/adapters/render/world/WorldRenderer.ts';
import { assetRoomFile, assetsMissing } from '../assets/support.ts';

describe('world projection', () => {
  it('projects thing positions without rounding and line ends with rounding', () => {
    const origin = { x: 32.5, y: 10 };
    expect(thingScreenPoint({ x: 2, y: 3, z: -1 }, origin, -0.5)).toEqual({ x: 31.5, y: 102 });
    expect(roundedScreenPoint({ x: 2.01, y: 3, z: 0 }, origin, -0.5)).toEqual({ x: 31.5, y: 86 });
  });

  it('rounds the floor source the way Draw_PlayerPlane negates and rounds', () => {
    expect(floorSourceOrigin({ x: 100.5, y: -2.5 })).toEqual({ x: 100, y: -3 });
  });

  it('picks the omni-directional frame through the 256-step lookup', () => {
    expect(omniIndex(0, 8)).toBe(0);
    expect(omniIndex(Math.PI / 2, 8)).toBe(2);
    expect(omniIndex(-Math.PI / 2, 8)).toBe(6);
    expect(omniIndex(Math.PI * 2 - 0.01, 8)).toBe(0);
  });

  it('lays out two 480 px views scaled into 640 x 480 with the original 1 px nudge', () => {
    const layout = splitScreenLayout();
    expect(layout.scalar).toBeCloseTo(2 / 3);
    expect(layout.offsets[0]?.y).toBeCloseTo(80);
    expect(layout.offsets[1]?.x).toBeCloseTo(320);
    expect(splitScreenMatrix(layout, 0)[4]).toBe(-1);
    expect(splitScreenMatrix(layout, 1)[4]).toBeCloseTo(320);
    expect(viewSideFor(0, 1)).toBe(1);
    expect(viewSideFor(1, 1)).toBe(0);
  });

  it('labels the weapon with ammo unless it is infinite', () => {
    const base = { playerIndex: 0, position: { x: 0, y: 0, z: 0 } };
    expect(playerLabelText({ ...base, status: { lifeRatio: 1, weaponShortName: 'weapon.pistol.shortName', ammo: undefined, visible: true } })).toBe('Pistol');
    expect(playerLabelText({ ...base, status: { lifeRatio: 1, weaponShortName: 'weapon.uzi.shortName', ammo: 42, visible: true } })).toBe('UZI:42');
  });

  it.skipIf(assetsMissing)('sizes the room bitmaps by truncating the room size', () => {
    expect(roomBitmapSize(assetRoomFile('ROOM_Single_0001'))).toEqual({ width: 704, height: 544 });
  });
});
