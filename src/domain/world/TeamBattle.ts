export const Team = {
  A: 'a',
  B: 'b',
} as const;

export type Team = (typeof Team)[keyof typeof Team];

export const TEAMS: readonly Team[] = Object.values(Team);

export { TEAM_BATTLE_RULES } from './tuning.ts';

export interface Combatant {
  readonly actorId: string;
  readonly team: Team;
}

export interface AttackSource extends Combatant {
  readonly playerIndex: number;
}

export interface TeamScores {
  readonly a: number;
  readonly b: number;
}

export interface TeamResult {
  readonly scores: TeamScores;
  readonly winner: Team | null;
  readonly abandoned: boolean;
}

export interface TeamMatchView {
  readonly scores: TeamScores;
  readonly remainingSeconds: number;
}

export class TeamBattle {
  private totals: Record<Team, number> = { a: 0, b: 0 };
  private outcome: TeamResult | undefined;

  get scores(): TeamScores {
    return { ...this.totals };
  }

  get result(): TeamResult | undefined {
    return this.outcome;
  }

  recordDeath(victim: Combatant, attacker: Combatant | undefined): void {
    if (this.outcome || !attacker || attacker.actorId === victim.actorId || attacker.team === victim.team) return;
    this.totals[attacker.team]++;
  }

  finish(abandoned = false): TeamResult {
    if (this.outcome) return this.outcome;
    const scores = Object.freeze(this.scores);
    const winner = abandoned || scores.a === scores.b ? null : scores.a > scores.b ? Team.A : Team.B;
    this.outcome = Object.freeze({ scores, winner, abandoned });
    return this.outcome;
  }
}
