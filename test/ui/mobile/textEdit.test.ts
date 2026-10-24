import { describe, expect, it } from 'vitest';
import { textEdit } from '../../../src/ui/mobile/textEdit.ts';

describe('soft keyboard text edits', () => {
  it('turns typing at the end into typed characters', () => {
    expect(textEdit('SA', 'SAM')).toEqual({ deletions: 0, insertion: 'M' });
  });

  it('turns a delete into backspaces', () => {
    expect(textEdit('SAM', 'S')).toEqual({ deletions: 2, insertion: '' });
  });

  it('replays an autocorrect or composition as backspaces and the new tail', () => {
    expect(textEdit('teh', 'the ')).toEqual({ deletions: 2, insertion: 'he ' });
  });

  it('resyncs when the game filtered what the keyboard composed', () => {
    expect(textEdit('A', 'ab')).toEqual({ deletions: 1, insertion: 'ab' });
  });

  it('counts an emoji as one character', () => {
    expect(textEdit('A\u{1F600}', 'A')).toEqual({ deletions: 1, insertion: '' });
  });
});
