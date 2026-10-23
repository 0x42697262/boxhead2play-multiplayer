import { describe, expect, it } from 'vitest';
import { SoundMixer, type AudioOutput } from '../../../src/adapters/audio/SoundMixer.ts';
import { SoundId } from '../../../src/domain/sounds.ts';

interface Started {
  readonly linkage: string;
  readonly gain: number;
  readonly end: () => void;
  stopped: boolean;
}

function fakeOutput(): AudioOutput & { readonly started: Started[] } {
  const started: Started[] = [];
  return {
    started,
    start(linkage, gain, onEnded) {
      const voice: Started = { linkage, gain, end: onEnded, stopped: false };
      started.push(voice);
      return {
        stop: () => {
          voice.stopped = true;
        },
      };
    },
  };
}

describe('SoundMixer (CSound semantics)', () => {
  it('plays a registration at its volume factor', () => {
    const output = fakeOutput();
    const mixer = new SoundMixer(output, true);
    mixer.play(SoundId.ZombieHit);
    expect(output.started).toEqual([expect.objectContaining({ linkage: 'Creature.Zombie.Hit.wav', gain: 0.3 })]);
  });

  it('restarts a sample that is still playing: one channel per registration', () => {
    const output = fakeOutput();
    const mixer = new SoundMixer(output, true);
    mixer.play(SoundId.PistolFire);
    mixer.play(SoundId.PistolFire);
    expect(output.started).toHaveLength(2);
    expect(output.started[0]?.stopped).toBe(true);
    expect(mixer.isPlaying(SoundId.PistolFire)).toBe(true);
    output.started[0]?.end();
    expect(mixer.isPlaying(SoundId.PistolFire)).toBe(true);
    output.started[1]?.end();
    expect(mixer.isPlaying(SoundId.PistolFire)).toBe(false);
  });

  it('keeps ambience registrations separate from the hit samples of the same file', () => {
    const output = fakeOutput();
    const mixer = new SoundMixer(output, true);
    mixer.play(SoundId.ZombieHit1);
    mixer.play(SoundId.ZombieAmbience1);
    mixer.play(SoundId.ZombieAmbience2);
    expect(mixer.ambiencePlaying()).toBe(2);
    mixer.stopAmbience();
    expect(mixer.ambiencePlaying()).toBe(0);
    expect(mixer.isPlaying(SoundId.ZombieHit1)).toBe(true);
  });

  it('turning sfx off stops everything and ignores new requests', () => {
    const output = fakeOutput();
    const mixer = new SoundMixer(output, true);
    mixer.play(SoundId.EffectExplosion);
    mixer.setSfxActive(false);
    expect(output.started[0]?.stopped).toBe(true);
    mixer.play(SoundId.EffectExplosion);
    expect(output.started).toHaveLength(1);
  });
});
