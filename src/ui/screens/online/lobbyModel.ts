import type { RoomIndex } from '../../../adapters/assets/schemas.ts';
import { CompletionState } from '../../../domain/world/CompletionState.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { KILLS_TO_WIN } from '../../../domain/world/tuning.ts';
import { LobbyState, type LobbyDto, type LobbyOptions, type LobbySummaryDto as LobbySummary, type OnlineMode } from '../../../net/protocol.ts';
import { OnlineStatus, type OnlineState } from '../../../services/online/OnlineClient.ts';
import { OnlineEnd, type OnlineSessionResult } from '../../../services/online/OnlineGameSession.ts';
import { t, type TextKey } from '../../../text/i18n.ts';

export interface JoinRow {
  readonly lobbyId: string;
  readonly label: string;
  readonly action: string;
  readonly joinable: boolean;
  readonly running: boolean;
}

export interface JoinList {
  readonly rows: readonly JoinRow[];
  readonly info: string;
}

export interface RoomPanel {
  readonly host: boolean;
  readonly levelIndex: number | undefined;
  readonly prompt: string;
  readonly canPlay: boolean;
  readonly members: readonly string[];
  readonly options: string;
  readonly notice: string | undefined;
}

const TITLES: Readonly<Record<OnlineMode, TextKey>> = {
  [GameMode.Coop]: 'online.title.coop',
  [GameMode.DeathMatch]: 'online.title.deathMatch',
};

export function roomName(rooms: RoomIndex, roomId: string): string {
  return rooms.rooms.find((room) => room.id === roomId)?.name ?? roomId;
}

export function roomIdForLevel(rooms: RoomIndex, levelIndex: number): string | undefined {
  return rooms.rooms.find((room) => room.iconFrame === levelIndex)?.id;
}

function levelIndexOf(rooms: RoomIndex, roomId: string): number | undefined {
  return rooms.rooms.find((room) => room.id === roomId)?.iconFrame;
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

export function noticeText(state: OnlineState, result: OnlineSessionResult | undefined): string | undefined {
  if (state.error) return t(`online.error.${state.error}`);
  if (state.leftReason) return t(`online.left.${state.leftReason}`);
  return result ? resultText(result) : undefined;
}

export function menuStatus(mode: OnlineMode, state: OnlineState, result: OnlineSessionResult | undefined): string {
  const notice = noticeText(state, result);
  if (notice) return notice;
  if (state.status !== OnlineStatus.Online) return t(`online.status.${state.status}`);
  return t('online.menu.status', { mode: t(TITLES[mode]), games: state.lobbies.filter((lobby) => lobby.mode === mode).length });
}

function joinAction(summary: LobbySummary, joiningId: string | undefined): string {
  if (summary.id === joiningId) return t('online.join.joining');
  if (summary.players >= summary.maxPlayers) return t('online.join.full');
  return t('online.join.join');
}

export function joinList(mode: OnlineMode, state: OnlineState, joiningId: string | undefined, slots: number): JoinList {
  const online = state.status === OnlineStatus.Online;
  const games = state.lobbies.filter((lobby) => lobby.mode === mode);
  const rows = games.slice(0, slots).map((summary) => ({
    lobbyId: summary.id,
    label: t('online.join.row', { name: summary.name.toUpperCase(), players: summary.players, max: summary.maxPlayers }),
    action: joinAction(summary, joiningId),
    joinable: online && joiningId === undefined && summary.players < summary.maxPlayers,
    running: summary.state === LobbyState.Playing,
  }));
  const notice = state.error ? t(`online.error.${state.error}`) : undefined;
  const info = notice ?? (!online ? t(`online.status.${state.status}`) : games.length === 0 ? t('online.join.none') : t('online.join.info'));
  return { rows, info };
}

function memberLine(lobby: LobbyDto, index: number, clientId: string | undefined): string {
  const member = lobby.members[index];
  if (!member) return '';
  const tags = [
    member.id === clientId ? t('online.member.you') : undefined,
    member.host ? t('online.member.host') : undefined,
    member.playerIndex !== null ? t('online.member.playing') : undefined,
    member.connected ? undefined : t('online.member.offline'),
  ].filter((tag): tag is string => tag !== undefined);
  const character = t(`online.character.${member.character}`);
  const line = t('online.room.member', { number: index + 1, name: member.name.toUpperCase(), character });
  return tags.length === 0 ? line : t('online.room.memberTags', { line, tags: tags.join(', ') });
}

function roomPrompt(lobby: LobbyDto, clientId: string | undefined): { readonly prompt: string; readonly canPlay: boolean } {
  const self = lobby.members.find((member) => member.id === clientId);
  if (lobby.state === LobbyState.Playing && self?.playerIndex === null) return { prompt: t('online.room.joinMatch'), canPlay: true };
  if (lobby.state === LobbyState.Playing) return { prompt: t('online.room.running'), canPlay: false };
  if (self?.host) return { prompt: t('online.room.start'), canPlay: true };
  const host = lobby.members.find((member) => member.host);
  return { prompt: t('online.room.waiting', { name: (host?.name ?? '').toUpperCase() }), canPlay: false };
}

export function roomPanel(lobby: LobbyDto, state: OnlineState, rooms: RoomIndex, result: OnlineSessionResult | undefined): RoomPanel {
  const { clientId } = state;
  const host = lobby.members.some((member) => member.host && member.id === clientId);
  return {
    host,
    levelIndex: levelIndexOf(rooms, lobby.roomId),
    ...roomPrompt(lobby, clientId),
    members: [t('online.room.players'), ...lobby.members.map((_, index) => memberLine(lobby, index, clientId))],
    options: optionsSummary(lobby.mode, lobby.options),
    notice: noticeText(state, result),
  };
}
