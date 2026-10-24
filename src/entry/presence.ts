import { Simulation } from '../services/ScreenFlow.ts';

export interface Presence {
  readonly hidden: boolean;
  readonly portrait: boolean;
}

export const AudioChange = {
  Keep: 'keep',
  Suspend: 'suspend',
  Resume: 'resume',
} as const;

export type AudioChange = (typeof AudioChange)[keyof typeof AudioChange];

export interface PresenceEffects {
  readonly releaseKeys: boolean;
  readonly resetTiming: boolean;
  readonly audio: AudioChange;
}

export function isAway(presence: Presence): boolean {
  return presence.hidden || presence.portrait;
}

export function freezes(presence: Presence, simulation: Simulation | undefined): boolean {
  return isAway(presence) && simulation === Simulation.Local;
}

function silenced(presence: Presence, simulation: Simulation | undefined): boolean {
  return presence.hidden || freezes(presence, simulation);
}

function audioChange(wasSilenced: boolean, isSilenced: boolean): AudioChange {
  if (wasSilenced === isSilenced) return AudioChange.Keep;
  return isSilenced ? AudioChange.Suspend : AudioChange.Resume;
}

export function presenceEffects(previous: Presence, next: Presence, simulation: Simulation | undefined): PresenceEffects {
  return {
    releaseKeys: !isAway(previous) && isAway(next),
    resetTiming: previous.hidden && !next.hidden,
    audio: audioChange(silenced(previous, simulation), silenced(next, simulation)),
  };
}
