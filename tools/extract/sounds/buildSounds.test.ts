import { describe, expect, it } from 'vitest';
import type { SoundDefinition } from '../swf/types.ts';
import { place, SHOW_FRAME, sprite, swfIndex } from '../testing/fixtures.ts';
import { buildSounds, exportedSoundFiles, SoundBuildError } from './buildSounds.ts';

const sound = (id: number): SoundDefinition => ({ kind: 'sound', id, format: 2, rate: 2, is16Bit: true, stereo: false, sampleCount: 100 });

const index = swfIndex(
  [
    sound(174),
    sound(558),
    sprite(186, [SHOW_FRAME, { kind: 'startSound', soundId: 174, syncStop: false, syncNoMultiple: false }, SHOW_FRAME]),
    sprite(195, [place(1, 186, { name: '_Logo_CrazyMonkeys' }), SHOW_FRAME]),
  ],
  { 'Weapon.Pistol.Fire.wav': 558, Screen_Intro: 195 },
);

const files = exportedSoundFiles(['174.mp3', '558_Weapon.Pistol.Fire.wav.mp3', '-1.wav']);
const registration = { table: 'mSamples', key: 'Weapon_Pistol_Fire_wav', type: 'sfx', linkage: 'Weapon.Pistol.Fire.wav', volume: 1, playback: 'positional' };

describe('buildSounds', () => {
  it('maps FFDec export names to character ids', () => {
    expect(Object.fromEntries(files)).toEqual({ '-1': '-1.wav', '174': '174.mp3', '558': '558_Weapon.Pistol.Fire.wav.mp3' });
  });

  it('names exported sounds by linkage and timeline sounds by their owner clip', () => {
    const output = buildSounds(index, files, [registration]);
    expect(output.index.sounds['Weapon.Pistol.Fire.wav']).toMatchObject({ file: 'Weapon.Pistol.Fire.mp3', source: 'export', sampleRate: 22050 });
    expect(output.index.sounds['Screen_Intro._Logo_CrazyMonkeys.Sound174']).toMatchObject({
      source: 'timeline',
      timelineStarts: [{ spriteId: 186, frame: 1, owner: 'Screen_Intro._Logo_CrazyMonkeys' }],
    });
    expect(output.copies).toContainEqual({ from: '558_Weapon.Pistol.Fire.wav.mp3', to: 'Weapon.Pistol.Fire.mp3' });
    expect(output.index.registrations).toEqual([registration]);
  });

  it('rejects registrations of sounds that are not exported', () => {
    expect(() => buildSounds(index, files, [{ ...registration, linkage: 'Missing.wav' }])).toThrow(SoundBuildError);
  });
});
