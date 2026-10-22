import { DomainEventType, type DomainEvent } from '../events.ts';
import { ZOMBIE_AMBIENCE_SOUNDS } from '../sounds.ts';
import { AMBIENCE_LEVELS, AMBIENCE_SAMPLE_SLOTS } from './tuning.ts';

export interface AmbienceState {
  readonly ticker: number;
  readonly sampleIndex: number;
  readonly channels: number;
  readonly frequencyTicks: number | undefined;
}

export const INITIAL_AMBIENCE: AmbienceState = { ticker: 0, sampleIndex: 0, channels: 0, frequencyTicks: undefined };

export interface AmbienceStep {
  readonly state: AmbienceState;
  readonly events: readonly DomainEvent[];
}

export function stepAmbience(state: AmbienceState, visibleZombies: number, playingSamples: number): AmbienceStep {
  const ticker = state.ticker + 1;
  const events: DomainEvent[] = [];
  let channels = state.channels;
  let frequencyTicks: number | undefined;
  if (visibleZombies === 0) {
    if (playingSamples > 0) events.push({ type: DomainEventType.AmbienceStopped });
  } else {
    const level = AMBIENCE_LEVELS.find((candidate) => visibleZombies <= candidate.maxZombies);
    channels = level?.channels ?? channels;
    frequencyTicks = level?.frequencyTicks;
  }
  let sampleIndex = state.sampleIndex;
  if (frequencyTicks !== undefined && ticker % frequencyTicks === 0 && playingSamples < channels) {
    const sound = ZOMBIE_AMBIENCE_SOUNDS[sampleIndex - 1];
    sampleIndex = (sampleIndex + 1) % AMBIENCE_SAMPLE_SLOTS;
    if (sound) events.push({ type: DomainEventType.AmbienceRequested, sound, maxChannels: channels });
  }
  return { state: { ticker, sampleIndex, channels, frequencyTicks }, events };
}
