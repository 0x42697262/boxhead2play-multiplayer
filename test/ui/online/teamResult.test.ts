import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoomIndexSchema } from '../../../src/adapters/assets/schemas.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { Team, TeamBattle } from '../../../src/domain/world/TeamBattle.ts';
import { LobbyState, ServerMessageType, type GameOver } from '../../../src/net/protocol.ts';
import { MAX_LOBBY_PLAYERS } from '../../../src/net/tuning.ts';
import { OnlineStatus, type OnlineState } from '../../../src/services/online/OnlineClient.ts';
import { OnlineEnd, type OnlineSessionResult } from '../../../src/services/online/OnlineGameSession.ts';
import { resultText, roomPanel } from '../../../src/ui/screens/online/lobbyModel.ts';
import { lobby } from '../../services/online/support.ts';

const catalog = new URL('../../../public/assets/rooms/index.json', import.meta.url);
const rooms = existsSync(catalog) ? RoomIndexSchema.parse(JSON.parse(readFileSync(catalog, 'utf8'))) : undefined;

describe.skipIf(!rooms)('approved Team Battle plan: every lobby member sees the authoritative final result', () => {
  it('replaces a spectator’s earlier quit notice with the same final result shown to match participants', () => {
    if (!rooms) throw new Error('Extract the game assets before running Team Battle verification');
    const initial = lobby({ mode: GameMode.TeamBattle, maxPlayers: MAX_LOBBY_PLAYERS });
    const room = { ...initial, options: { ...initial.options, teamZombiesActive: false, teamDevilsActive: false }, members: initial.members.map((member, index) => ({ ...member, team: index === 0 ? Team.A : Team.B, teamLocked: false })) };
    const [killer, killed] = room.members;
    if (!killer || !killed) throw new Error('The completed match needs its two team members');
    const battle = new TeamBattle();
    const attacker = { actorId: killer.id, team: killer.team };
    const victim = { actorId: killed.id, team: killed.team };
    battle.recordDeath(victim, attacker);
    const gameOver: GameOver = { type: ServerMessageType.GameOver, matchId: room.id, state: CompletionState.TeamFinished, winnerName: null, score: 0, teamResult: battle.finish() };
    const state: OnlineState = { status: OnlineStatus.Online, clientId: victim.actorId, lobby: room, lobbies: [], error: undefined, leftReason: undefined, result: gameOver };
    const quit: OnlineSessionResult = { end: OnlineEnd.Quit, state: CompletionState.Quit, gameOver: undefined };
    const finished: OnlineSessionResult = { end: OnlineEnd.Finished, state: gameOver.state, gameOver };
    const running = { ...room, state: LobbyState.Playing };
    expect(roomPanel(running, { ...state, lobby: running }, rooms, quit).notice).toBe(resultText(quit));
    const spectator = roomPanel(room, state, rooms, quit);
    const participant = roomPanel(room, state, rooms, finished);
    expect(spectator.notice).not.toBe(resultText(quit));
    expect(spectator.notice).toBe(participant.notice);
  });
});
