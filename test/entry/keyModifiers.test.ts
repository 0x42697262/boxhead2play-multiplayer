import { describe, expect, it } from 'vitest';
import { isShortcut, releasesHeldKeys } from '../../src/entry/keyModifiers.ts';

const plain = { ctrlKey: false, metaKey: false, altKey: false };

describe('key modifiers', () => {
  it('leaves Ctrl, Cmd and Alt combinations to the browser', () => {
    expect(isShortcut(plain)).toBe(false);
    expect(isShortcut({ ...plain, ctrlKey: true })).toBe(true);
    expect(isShortcut({ ...plain, metaKey: true })).toBe(true);
    expect(isShortcut({ ...plain, altKey: true })).toBe(true);
  });

  it('releases every held key when Cmd goes up, because macOS swallows key ups while it is held', () => {
    expect(releasesHeldKeys('MetaLeft')).toBe(true);
    expect(releasesHeldKeys('MetaRight')).toBe(true);
    expect(releasesHeldKeys('KeyW')).toBe(false);
    expect(releasesHeldKeys('ControlLeft')).toBe(false);
  });
});
