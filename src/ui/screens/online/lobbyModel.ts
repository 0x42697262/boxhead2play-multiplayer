import { ROOM_MEMBER_LINES } from './tuning.ts';
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
  readonly page: number;
  readonly pages: number;
}

export interface RoomPanel {
  readonly host: boolean;
  readonly configurable: boolean;
  readonly levelIndex: number | undefined;
  readonly lobbyOptions: LobbyOptions;
  readonly prompt: string;
  readonly canPlay: boolean;
  readonly members: readonly string[];
  readonly options: string;
  readonly notice: string | undefined;
  readonly invite: string;
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
    case OnlineEnd.Failed:
      return t('online.result.failed');
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
  const counts = { players: summary.players, max: summary.maxPlayers };
  if (summary.players >= summary.maxPlayers) return t('online.join.full', counts);
  return t('online.join.join', counts);
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(page, 0), pages - 1);
}

export function joinList(mode: OnlineMode, state: OnlineState, joiningId: string | undefined, slots: number, requestedPage = 0): JoinList {
  const online = state.status === OnlineStatus.Online;
  const games = state.lobbies.filter((lobby) => lobby.mode === mode);
  const pages = pageCount(games.length, slots);
  const page = clampPage(requestedPage, pages);
  const rows = games.slice(page * slots, (page + 1) * slots).map((summary) => ({
    lobbyId: summary.id,
    label: t('online.join.row', { name: summary.name.toUpperCase() }),
    action: joinAction(summary, joiningId),
    joinable: online && joiningId === undefined && summary.players < summary.maxPlayers,
    running: summary.state === LobbyState.Playing,
  }));
  const notice = state.error ? t(`online.error.${state.error}`) : undefined;
  const listInfo = pages > 1 ? t('online.join.paged', { page: page + 1, pages }) : t('online.join.info');
  const info = notice ?? (!online ? t(`online.status.${state.status}`) : games.length === 0 ? t('online.join.none') : listInfo);
  return { rows, info, page, pages };
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

export function visibleMemberIndices(count: number, selfIndex: number | undefined, lines: number): { readonly shown: readonly number[]; readonly hidden: number } {
  const all = Array.from({ length: count }, (_unused, index) => index);
  if (count <= lines) return { shown: all, hidden: 0 };
  const room = lines - 1;
  const first = all.slice(0, room);
  const shown = selfIndex === undefined || selfIndex < room ? first : [...first.slice(0, room - 1), selfIndex];
  return { shown, hidden: count - shown.length };
}

function memberLines(lobby: LobbyDto, clientId: string | undefined): string[] {
  const selfIndex = lobby.members.findIndex((member) => member.id === clientId);
  const { shown, hidden } = visibleMemberIndices(lobby.members.length, selfIndex < 0 ? undefined : selfIndex, ROOM_MEMBER_LINES);
  const lines = shown.map((index) => memberLine(lobby, index, clientId));
  return [t('online.room.players', { count: lobby.members.length, max: lobby.maxPlayers }), ...lines, ...(hidden > 0 ? [t('online.room.more', { count: hidden })] : [])];
}

function roomPrompt(lobby: LobbyDto, clientId: string | undefined): { readonly prompt: string; readonly canPlay: boolean } {
  const self = lobby.members.find((member) => member.id === clientId);
  if (lobby.state === LobbyState.Playing && self?.playerIndex === null) return { prompt: t('online.room.joinMatch'), canPlay: true };
  if (lobby.state === LobbyState.Playing) return { prompt: t('online.room.running'), canPlay: false };
  if (self?.host) return { prompt: t('online.room.start'), canPlay: true };
  const host = lobby.members.find((member) => member.host);
  return { prompt: t('online.room.waiting', { name: (host?.name ?? '').toUpperCase() }), canPlay: false };
}

export function roomPanel(lobby: LobbyDto, state: OnlineState, rooms: RoomIndex, result: OnlineSessionResult | undefined, linkCopied = false): RoomPanel {
  const { clientId } = state;
  const host = lobby.members.some((member) => member.host && member.id === clientId);
  return {
    host,
    configurable: host && lobby.state === LobbyState.Waiting,
    levelIndex: levelIndexOf(rooms, lobby.roomId),
    lobbyOptions: lobby.options,
    ...roomPrompt(lobby, clientId),
    members: memberLines(lobby, clientId),
    options: optionsSummary(lobby.mode, lobby.options),
    notice: noticeText(state, result),
    invite: t(linkCopied ? 'invite.roomCopied' : 'invite.roomCopy', { code: lobby.code }),
  };
}
