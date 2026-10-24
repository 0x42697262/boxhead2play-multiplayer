import { describe, expect, it } from 'vitest';
import {
  lifeFrameIndex,
  MessageTrack,
  messageAlpha,
  padNumber,
  ScorePopups,
  timerFrameIndex,
  upgradeRows,
} from '../../../src/adapters/render/hud/hudAnimation.ts';
import { MessageTone } from '../../../src/domain/events.ts';
import type { HudMessageEntry } from '../../../src/domain/hud/HudState.ts';

function message(tick: number): HudMessageEntry {
  return { tone: MessageTone.Info, text: { key: 'hud.lifeUp' }, tick };
}

describe('HUD numbers', () => {
  it('pads the score to 12 digits and frags to 2', () => {
    expect(padNumber(1234, 12)).toBe('000000001234');
    expect(padNumber(7, 2)).toBe('07');
  });

  it('maps life to the 101-frame bar like gotoAndStop', () => {
    expect(lifeFrameIndex(1, 101)).toBe(100);
    expect(lifeFrameIndex(0, 101)).toBe(0);
    expect(lifeFrameIndex(0.5, 101)).toBe(50);
    expect(timerFrameIndex(1, 101)).toBe(100);
    expect(timerFrameIndex(0.25, 101)).toBe(25);
  });
});

describe('score popups', () => {
  it('fly toward the score total, speed up by 5 % and fade near the top', () => {
    const popups = new ScorePopups();
    popups.add(100, { x: 320, y: 200 }, { x: 320, y: 0 });
    const first = popups.step();
    expect(first[0]?.popup.y).toBe(195);
    expect(first[0]?.alpha).toBe(100);
    expect(first[0]?.popup.dy).toBeCloseTo(-5.25);
    let draws = first;
    while (popups.count > 0) draws = popups.step();
    expect(draws[0]?.alpha).toBeLessThan(0);
  });
});

describe('HUD messages', () => {
  it('slide up from the bottom and push older messages by 19 px', () => {
    const track = new MessageTrack({ x: 320, y: 480 });
    const older = message(0);
    track.sync([older]);
    expect(track.step(0, 25)[0]?.y).toBe(455);
    const newer = message(1);
    track.sync([older, newer]);
    const [first, second] = track.step(1, 25);
    expect(first?.y).toBeCloseTo(455 - (75 + 19) * 0.25);
    expect(second?.y).toBe(455);
  });

  it('keep their place when every frame brings equal copies, like online JSON frames', () => {
    const track = new MessageTrack({ x: 320, y: 480 });
    const copy = (entry: ReturnType<typeof message>) => JSON.parse(JSON.stringify(entry)) as ReturnType<typeof message>;
    const older = message(0);
    const newer = message(1);
    track.sync([copy(older)]);
    track.step(0, 25);
    track.sync([copy(older), copy(newer)]);
    track.step(1, 25);
    for (let tick = 2; tick < 30; tick++) {
      track.sync([copy(older), copy(newer)]);
      track.step(tick, 25);
    }
    const [first, second] = track.step(30, 25);
    expect(first?.y).toBeCloseTo(480 - 100 - 19, 0);
    expect(second?.y).toBeCloseTo(480 - 100, 0);
  });

  it('fade during the last half second of three', () => {
    expect(messageAlpha(1000)).toBe(100);
    expect(messageAlpha(2750)).toBe(50);
  });
});

describe('pause screen upgrade list', () => {
  it('fills columns with one row more than a third of the list, like the original', () => {
    const entries = Array.from({ length: 7 }, (_, index) => ({ index, name: 'hud.lifeUp' as const, active: false, newWeapon: false }));
    const rows = upgradeRows(entries);
    expect(rows.map((row) => `${row.column}:${row.row}`)).toEqual([
      '_Upgrade_C1:0',
      '_Upgrade_C1:1',
      '_Upgrade_C1:2',
      '_Upgrade_C1:3',
      '_Upgrade_C2:0',
      '_Upgrade_C2:1',
      '_Upgrade_C2:2',
    ]);
  });
});
