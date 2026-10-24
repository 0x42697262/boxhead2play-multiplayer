import { mapLimited, type Fetcher } from '../assets/AssetLoader.ts';
import type { SoundIndex } from '../assets/schemas.ts';
import { LoadPhase, PARALLEL_DOWNLOADS, type ProgressListener } from '../assets/tuning.ts';
import type { AssetLocator } from '../assets/urls.ts';
import type { AudioOutput, VoiceHandle } from './SoundMixer.ts';

export class WebAudioOutput implements AudioOutput {
  private readonly buffers = new Map<string, AudioBuffer>();

  constructor(private readonly context: AudioContext) {}

  static create(): WebAudioOutput | undefined {
    try {
      return new WebAudioOutput(new AudioContext());
    } catch {
      return undefined;
    }
  }

  get unlocked(): boolean {
    return this.context.state === 'running';
  }

  async load(
    index: SoundIndex,
    location: { readonly locator: AssetLocator; readonly soundsCatalogPath: string },
    fetcher: Fetcher,
    onProgress: ProgressListener = () => undefined,
  ): Promise<void> {
    const linkages = [...new Set(index.registrations.map((registration) => registration.linkage))];
    let loaded = 0;
    await mapLimited(linkages, PARALLEL_DOWNLOADS, async (linkage) => {
      const entry = index.sounds[linkage];
      if (entry) {
        const bytes = await fetcher.bytes(location.locator.entryUrl(location.soundsCatalogPath, entry.file));
        this.buffers.set(linkage, await this.context.decodeAudioData(bytes));
      }
      loaded++;
      onProgress({ phase: LoadPhase.Sounds, loaded, total: linkages.length });
    });
  }

  unlock(): Promise<void> {
    return this.context.state === 'running' ? Promise.resolve() : this.context.resume();
  }

  suspend(): Promise<void> {
    return this.context.state === 'running' ? this.context.suspend() : Promise.resolve();
  }

  start(linkage: string, gain: number, onEnded: () => void): VoiceHandle | undefined {
    const buffer = this.buffers.get(linkage);
    if (!buffer) return undefined;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const volume = this.context.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(this.context.destination);
    source.onended = onEnded;
    source.start();
    return {
      stop: () => {
        source.onended = null;
        source.stop();
        source.disconnect();
      },
    };
  }
}
