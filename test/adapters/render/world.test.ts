import { describe, expect, it } from 'vitest';
import {
  floorSourceOrigin,
  omniIndex,
  roundedScreenPoint,
  thingScreenPoint,
} from '../../../src/adapters/render/world/projection.ts';
import { roomBitmapSize } from '../../../src/adapters/render/world/RoomPlanes.ts';
import { decalShown, flashLevel, playerLabelText, viewOrigin } from '../../../src/adapters/render/world/WorldRenderer.ts';
import { DecalKind, DomainEventType } from '../../../src/domain/events.ts';
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

  it('labels the weapon with ammo unless it is infinite', () => {
    const base = { playerIndex: 0, position: { x: 0, y: 0, z: 0 } };
    expect(playerLabelText({ ...base, status: { lifeRatio: 1, weaponShortName: 'weapon.pistol.shortName', ammo: undefined, visible: true, respawnTicks: undefined } })).toBe('Pistol');
    expect(playerLabelText({ ...base, status: { lifeRatio: 1, weaponShortName: 'weapon.uzi.shortName', ammo: 42, visible: true, respawnTicks: undefined } })).toBe('UZI:42');
  });

  it.skipIf(assetsMissing)('sizes the room bitmaps by truncating the room size', () => {
    expect(roomBitmapSize(assetRoomFile('ROOM_Single_0001'))).toEqual({ width: 704, height: 544 });
  });
});

describe('effect preferences', () => {
  it('drops the shake offset from the view and hides blood decals but not scorch marks', () => {
    const camera = { view: { playerIndex: 0, rect: { x: 100, y: 50, width: 640, height: 480 }, drawOrigin: { x: 112, y: 41 } }, entries: [] };
    expect(viewOrigin(camera, { screenShake: true, blood: true, flashes: true })).toEqual({ x: 112, y: 41 });
    expect(viewOrigin(camera, { screenShake: false, blood: true, flashes: true })).toEqual({ x: 100, y: 50 });
    const decal = (kind: DecalKind) => ({ type: DomainEventType.DecalRequested, decal: kind, symbol: 's', xPx: 0, yPx: 0, frame: 0, rotationIndex: 0, rotationCount: 1, scaleX: 1, scaleY: 1 });
    expect(decalShown(decal(DecalKind.BloodSplat), { screenShake: true, blood: false, flashes: true })).toBe(false);
    expect(decalShown(decal(DecalKind.ScorchMark), { screenShake: true, blood: false, flashes: true })).toBe(true);
  });

  it('draws the explosion flash only with flashes on, room detail on and a positive brightness', () => {
    const all = { screenShake: true, blood: true, flashes: true };
    expect(flashLevel(0.5, true, all)).toBe(128);
    expect(flashLevel(2, true, all)).toBe(255);
    expect(flashLevel(0.5, true, { ...all, flashes: false })).toBeUndefined();
    expect(flashLevel(0.5, false, all)).toBeUndefined();
    expect(flashLevel(0, true, all)).toBeUndefined();
  });
});
