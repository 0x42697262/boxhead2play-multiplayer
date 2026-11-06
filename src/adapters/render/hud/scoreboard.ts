import type { Team } from '../../../domain/world/TeamBattle.ts';
import type { HudFrame } from '../world/WorldFrame.ts';

export interface ScoreboardRow {
  readonly playerIndex: number;
  readonly team?: Team;
  readonly rank: number;
  readonly name: string;
  readonly kills: number;
  readonly deaths: number;
  readonly local: boolean;
}

export type ScoreboardSource = Pick<HudFrame, 'localPlayerIndex' | 'frags' | 'deaths'> & { readonly players: readonly { readonly playerIndex: number; readonly team?: Team }[] };

export function scoreboardRows(hud: ScoreboardSource, nameOf: (playerIndex: number) => string): ScoreboardRow[] {
  const sorted = hud.players
    .map(({ playerIndex, team }) => ({ playerIndex, ...(team ? { team } : {}), kills: hud.frags[playerIndex] ?? 0, deaths: hud.deaths[playerIndex] ?? 0 }))
    .sort((first, second) => (first.team ?? '').localeCompare(second.team ?? '') || second.kills - first.kills || first.deaths - second.deaths || first.playerIndex - second.playerIndex);
  return sorted.map((entry) => {
    const firstEqual = sorted.findIndex((other) => other.team === entry.team && other.kills === entry.kills && other.deaths === entry.deaths);
    return { ...entry, rank: sorted.slice(0, firstEqual + 1).filter((other) => other.team === entry.team).length, name: nameOf(entry.playerIndex), local: entry.playerIndex === hud.localPlayerIndex };
  });
}
