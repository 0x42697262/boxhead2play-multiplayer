import { SOUND_SAMPLES, ZOMBIE_AMBIENCE_SOUNDS, type SoundId } from '../../domain/sounds.ts';

export interface VoiceHandle {
  stop(): void;
}

export interface AudioOutput {
  start(linkage: string, gain: number, onEnded: () => void): VoiceHandle | undefined;
}

interface Voice {
  handle: VoiceHandle | undefined;
  playing: boolean;
}

const AMBIENCE: ReadonlySet<SoundId> = new Set(ZOMBIE_AMBIENCE_SOUNDS);

export class SoundMixer {
  private readonly voices = new Map<SoundId, Voice>();

  constructor(
    private readonly output: AudioOutput,
    private gain: number,
  ) {}

  get volume(): number {
    return this.gain;
  }

  play(sound: SoundId): void {
    if (this.gain <= 0) return;
    const voice = this.voice(sound);
    if (voice.playing) this.stopVoice(voice);
    const sample = SOUND_SAMPLES[sound];
    voice.playing = true;
    const handle = this.output.start(sample.linkage, sample.volume * this.gain, () => {
      if (voice.handle === handle) voice.playing = false;
    });
    voice.handle = handle;
    if (!handle) voice.playing = false;
  }

  isPlaying(sound: SoundId): boolean {
    return this.voices.get(sound)?.playing ?? false;
  }

  ambiencePlaying(): number {
    let count = 0;
    for (const sound of AMBIENCE) if (this.isPlaying(sound)) count++;
    return count;
  }

  stopAmbience(): void {
    for (const sound of AMBIENCE) {
      const voice = this.voices.get(sound);
      if (voice) this.stopVoice(voice);
    }
  }

  setVolume(gain: number): void {
    this.gain = gain;
    if (gain <= 0) this.stopAll();
  }

  stopAll(): void {
    for (const voice of this.voices.values()) this.stopVoice(voice);
  }

  private voice(sound: SoundId): Voice {
    let voice = this.voices.get(sound);
    if (!voice) {
      voice = { handle: undefined, playing: false };
      this.voices.set(sound, voice);
    }
    return voice;
  }

  private stopVoice(voice: Voice): void {
    voice.playing = false;
    const handle = voice.handle;
    voice.handle = undefined;
    handle?.stop();
  }
}
