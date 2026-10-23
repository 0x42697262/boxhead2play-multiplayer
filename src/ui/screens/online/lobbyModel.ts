import type { RoomIndex } from '../../../adapters/assets/schemas.ts';
import { CompletionState } from '../../../domain/world/CompletionState.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import { KILLS_TO_WIN } from '../../../domain/world/tuning.ts';
import { LobbyState, type LobbyDto, type LobbyOptions, type OnlineMode } from '../../../net/protocol.ts';
import { OnlineStatus, type OnlineState } from '../../../services/online/OnlineClient.ts';
import { OnlineEnd, type OnlineSessionResult } from '../../../services/online/OnlineGameSession.ts';
import { t, type TextKey } from '../../../text/i18n.ts';

export const LobbyCommand = {
  Host: 'host',
  Back: 'back',
  Start: 'start',
  JoinGame: 'joinGame',
  ChangeLevel: 'changeLevel',
  Leave: 'leave',
} as const;

export type LobbyCommand = (typeof LobbyCommand)[keyof typeof LobbyCommand];

export interface GameRow {
  readonly id: string;
  readonly text: string;
  readonly joinable: boolean;
}

export interface MemberRow {
  readonly text: string;
  readonly offline: boolean;
}

export interface CharacterChoice {
  readonly value: PlayerCharacter;
  readonly label: string;
}

export interface LobbyViewModel {
  readonly title: string;
  readonly status: string;
  readonly online: boolean;
  readonly notice: string | undefined;
  readonly character: PlayerCharacter;
  readonly browser: { readonly rows: readonly GameRow[]; readonly empty: string } | undefined;
  readonly room:
    | {
        readonly name: string;
        readonly level: string;
        readonly options: string;
        readonly members: readonly MemberRow[];
        readonly waitingText: string | undefined;
      }
    | undefined;
  readonly commands: readonly LobbyCommand[];
}

export interface LobbyModelInput {
  readonly mode: OnlineMode;
  readonly state: OnlineState;
  readonly rooms: RoomIndex;
  readonly character: PlayerCharacter;
  readonly result: OnlineSessionResult | undefined;
}

export const CHARACTER_CHOICES: readonly CharacterChoice[] = Object.values(PlayerCharacter).map((value) => ({
  value,
  label: t(`online.character.${value}`),
}));

const TITLES: Readonly<Record<OnlineMode, TextKey>> = {
  [GameMode.Coop]: 'online.title.coop',
  [GameMode.DeathMatch]: 'online.title.deathMatch',
};

const STATUS: Readonly<Record<OnlineStatus, TextKey>> = {
  [OnlineStatus.Offline]: 'online.status.offline',
  [OnlineStatus.Connecting]: 'online.status.connecting',
  [OnlineStatus.Online]: 'online.status.online',
};

export function roomName(rooms: RoomIndex, roomId: string): string {
  return rooms.rooms.find((room) => room.id === roomId)?.name ?? roomId;
}

function onOff(value: boolean): string {
  return t(value ? 'online.on' : 'online.off');
}

export function optionsSummary(mode: OnlineMode, options: LobbyOptions): string {
  const speed = t(`online.speed.${options.gameSpeed}`);
  const collisions = onOff(options.collisionsActive);
  if (mode === GameMode.DeathMatch) return t('online.options.deathMatch', { kills: KILLS_TO_WIN[options.gameAmount], speed, collisions });
  return t('online.options.coop', {
    difficulty: t(`online.difficulty.${options.difficulty}`),
    speed,
    devils: onOff(options.devilsActive),
    collisions,
    damage: onOff(options.damageActive),
  });
}

export function resultText(result: OnlineSessionResult): string {
  switch (result.end) {
    case OnlineEnd.Quit:
      return t('online.result.quit');
    case OnlineEnd.Lost:
      return t('online.result.lost');
    case OnlineEnd.Finished:
      break;
  }
  const over = result.gameOver;
  if (result.state === CompletionState.Error) return t('online.result.error');
  if (over?.winnerName) return t('online.result.won', { name: over.winnerName });
  return t('online.result.over', { score: String(over?.score ?? 0) });
}

function noticeText(input: LobbyModelInput): string | undefined {
  const { state } = input;
  if (state.error) return t(`online.error.${state.error}`);
  if (state.leftReason) return t(`online.left.${state.leftReason}`);
  return input.result ? resultText(input.result) : undefined;
}

function memberRows(lobby: LobbyDto, clientId: string | undefined): MemberRow[] {
  return lobby.members.map((member) => {
    const tags = [
      member.id === clientId ? t('online.member.you') : undefined,
      member.host ? t('online.member.host') : undefined,
      member.playerIndex !== null ? t('online.member.playing') : undefined,
      member.connected ? undefined : t('online.member.offline'),
    ].filter((tag): tag is string => tag !== undefined);
    const character = CHARACTER_CHOICES.find((choice) => choice.value === member.character)?.label ?? '';
    return { text: [member.name, character, ...tags].join(' · '), offline: !member.connected };
  });
}

function roomCommands(lobby: LobbyDto, clientId: string | undefined): LobbyCommand[] {
  const self = lobby.members.find((member) => member.id === clientId);
  const host = self?.host ?? false;
  const commands: LobbyCommand[] = [];
  if (lobby.state === LobbyState.Waiting && host) commands.push(LobbyCommand.Start, LobbyCommand.ChangeLevel);
  if (lobby.state === LobbyState.Playing && self?.playerIndex === null) commands.push(LobbyCommand.JoinGame);
  commands.push(LobbyCommand.Leave);
  return commands;
}

export function lobbyViewModel(input: LobbyModelInput): LobbyViewModel {
  const { state, mode, rooms } = input;
  const online = state.status === OnlineStatus.Online;
  const base = { title: t(TITLES[mode]), status: t(STATUS[state.status]), online, notice: noticeText(input), character: input.character };
  const lobby = state.lobby;
  if (!lobby) {
    const rows = state.lobbies
      .filter((summary) => summary.mode === mode)
      .map((summary) => ({
        id: summary.id,
        text: t('online.gameRow', {
          name: summary.name,
          level: roomName(rooms, summary.roomId),
          players: summary.players,
          max: summary.maxPlayers,
          state: t(`online.state.${summary.state}`),
        }),
        joinable: online && summary.players < summary.maxPlayers,
      }));
    return { ...base, browser: { rows, empty: t('online.noGames') }, room: undefined, commands: [LobbyCommand.Host, LobbyCommand.Back] };
  }
  const self = lobby.members.find((member) => member.id === state.clientId);
  const waitingText = lobby.state === LobbyState.Waiting && !self?.host ? t('online.waitingForHost') : undefined;
  return {
    ...base,
    browser: undefined,
    room: {
      name: lobby.name,
      level: t('online.level', { level: roomName(rooms, lobby.roomId) }),
      options: optionsSummary(lobby.mode, lobby.options),
      members: memberRows(lobby, state.clientId),
      waitingText,
    },
    commands: roomCommands(lobby, state.clientId),
  };
}
