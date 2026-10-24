import type { MemberDto, NetHud } from '../../net/protocol.ts';

export const PlayerPresence = {
  Alive: 'alive',
  Dead: 'dead',
  Offline: 'offline',
} as const;

export type PlayerPresence = (typeof PlayerPresence)[keyof typeof PlayerPresence];

export interface PlayerListRow {
  readonly playerIndex: number;
  readonly name: string;
  readonly local: boolean;
  readonly presence: PlayerPresence;
  readonly respawnSeconds: number | undefined;
  readonly lifeRatio: number;
  readonly latencyMs: number | undefined;
}

export interface PlayerListView {
  readonly count: number;
  readonly capacity: number;
  readonly rows: readonly PlayerListRow[];
}

export interface PlayerListSource {
  readonly members: readonly MemberDto[];
  readonly capacity: number;
  readonly players: NetHud['players'];
  readonly localPlayerIndex: number;
  readonly latencyOf: (playerIndex: number) => number | undefined;
  readonly ticksPerSecond: number;
}

const FULL_LIFE = 1;

export function playerListView(source: PlayerListSource): PlayerListView {
  const rows = source.members
    .flatMap((member) => (member.playerIndex === null ? [] : [{ member, playerIndex: member.playerIndex }]))
    .sort((first, second) => first.playerIndex - second.playerIndex)
    .map(({ member, playerIndex }): PlayerListRow => {
      const status = source.players.find((player) => player.playerIndex === playerIndex)?.status;
      const respawnTicks = status?.respawnTicks;
      const presence = !member.connected ? PlayerPresence.Offline : respawnTicks !== undefined ? PlayerPresence.Dead : PlayerPresence.Alive;
      return {
        playerIndex,
        name: member.name,
        local: playerIndex === source.localPlayerIndex,
        presence,
        respawnSeconds: respawnTicks === undefined ? undefined : Math.ceil(respawnTicks / source.ticksPerSecond),
        lifeRatio: presence === PlayerPresence.Alive ? Math.max(0, Math.min(FULL_LIFE, status?.lifeRatio ?? FULL_LIFE)) : 0,
        latencyMs: member.connected ? source.latencyOf(playerIndex) : undefined,
      };
    });
  return { count: rows.length, capacity: source.capacity, rows };
}
