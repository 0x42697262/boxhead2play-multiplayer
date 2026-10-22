import { describe, expect, it } from 'vitest';
import { move, place, SHOW_FRAME, sprite, translate } from '../testing/fixtures.ts';
import { resolveTimeline, TimelineError } from './timeline.ts';

describe('resolveTimeline', () => {
  it('keeps objects across frames and applies moves, replacements and removals', () => {
    const frames = resolveTimeline(
      sprite(10, [
        { kind: 'label', name: 'start' },
        place(2, 1, { matrix: translate(5, 5), name: 'a' }),
        place(1, 3),
        SHOW_FRAME,
        move(2, { matrix: translate(9, 9) }),
        { kind: 'startSound', soundId: 7, syncStop: false, syncNoMultiple: false },
        SHOW_FRAME,
        move(2, { characterId: 4 }),
        { kind: 'remove', depth: 1 },
        SHOW_FRAME,
      ]),
    );
    expect(frames).toHaveLength(3);
    expect(frames[0]?.labels).toEqual(['start']);
    expect(frames[0]?.displayList.map((item) => item.depth)).toEqual([1, 2]);
    const moved = frames[1]?.displayList.find((item) => item.depth === 2);
    expect(moved).toMatchObject({ characterId: 1, name: 'a', instance: 0, matrix: translate(9, 9) });
    expect(frames[1]?.sounds.map((sound) => sound.soundId)).toEqual([7]);
    const replaced = frames[2]?.displayList;
    expect(replaced).toHaveLength(1);
    expect(replaced?.[0]).toMatchObject({ characterId: 4, name: 'a', matrix: translate(9, 9), instance: 2 });
  });

  it('pads to the declared frame count', () => {
    const frames = resolveTimeline({ ...sprite(1, [place(1, 2), SHOW_FRAME]), frameCount: 3 });
    expect(frames).toHaveLength(3);
    expect(frames[2]?.displayList).toHaveLength(1);
  });

  it('rejects modifying an empty depth', () => {
    expect(() => resolveTimeline(sprite(1, [move(5, {}), SHOW_FRAME]))).toThrow(TimelineError);
  });
});
