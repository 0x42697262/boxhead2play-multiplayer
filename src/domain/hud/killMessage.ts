import type { TextRef } from '../events.ts';
import { ThingClass } from '../things/ThingClass.ts';

export interface KillMessage {
  readonly text: TextRef;
  readonly names: Readonly<Record<string, number>>;
}

export interface KillCause {
  readonly victim: number;
  readonly killer: number | undefined;
  readonly killerClass: ThingClass | undefined;
}

export function killMessage({ victim, killer, killerClass }: KillCause): KillMessage {
  if (killer === victim) return { text: { key: 'hud.kill.self' }, names: { victim } };
  if (killer !== undefined) return { text: { key: 'hud.kill.player' }, names: { killer, victim } };
  switch (killerClass) {
    case ThingClass.Zombie:
      return { text: { key: 'hud.kill.zombie' }, names: { victim } };
    case ThingClass.Devil:
      return { text: { key: 'hud.kill.devil' }, names: { victim } };
    default:
      return { text: { key: 'hud.kill.other' }, names: { victim } };
  }
}
