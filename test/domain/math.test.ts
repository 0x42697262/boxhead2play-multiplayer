import { describe, expect, it } from 'vitest';
import { Angle, angleToDirectionIndex, normalizeRadians } from '../../src/domain/math/Angle.ts';
import { Direction } from '../../src/domain/math/Direction.ts';
import { Position } from '../../src/domain/math/Position.ts';
import { SeededRng, SequenceRng } from '../../src/domain/math/Rng.ts';

describe('Angle', () => {
  it('normalizes into [0, 2pi)', () => {
    expect(normalizeRadians(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(new Angle(Math.PI * 2).radians).toBeCloseTo(0);
  });

  it('maps radians to the 8 compass directions with east = 0 and south = 2', () => {
    expect(new Angle(0).direction).toBe(Direction.East);
    expect(new Angle(Math.PI / 2).direction).toBe(Direction.South);
    expect(new Angle(Math.PI * 1.5).direction).toBe(Direction.North);
  });

  it('turns the short way round', () => {
    const current = new Angle(0.1);
    expect(current.turnSign(new Angle(Math.PI * 1.9))).toBe(-1);
    expect(current.turnSign(new Angle(1))).toBe(1);
  });

  it('wraps differences into [-pi, pi]', () => {
    expect(new Angle(0.1).difference(new Angle(Math.PI * 1.9))).toBeCloseTo(-(0.1 * Math.PI + 0.1), 5);
  });

  it('looks up animation directions through the 256-step table', () => {
    expect(angleToDirectionIndex(new Angle(0), 8)).toBe(0);
    expect(angleToDirectionIndex(new Angle(Math.PI), 8)).toBe(4);
    expect(angleToDirectionIndex(new Angle(Math.PI * 1.99), 8)).toBe(0);
  });
});

describe('Position', () => {
  it('snaps to the centre of its cell', () => {
    expect(new Position(3.9, 2.1).cellCentre()).toEqual(new Position(3.5, 2.5, 0));
  });

  it('normalizes to a requested length and leaves zero vectors alone', () => {
    expect(new Position(3, 4).normalize(10).length).toBeCloseTo(10);
    expect(Position.zero().normalize(5).isZero()).toBe(true);
  });
});

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it('replays a fixed sequence', () => {
    const rng = new SequenceRng([0.5, 0.99]);
    expect(rng.int(4)).toBe(2);
    expect(rng.int(4)).toBe(3);
  });
});
