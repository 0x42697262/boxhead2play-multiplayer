import { describe, expect, it } from 'vitest';
import { CompletionState } from '../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import type { GameStarted } from '../../src/net/protocol.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { OnlineEnd } from '../../src/services/online/OnlineGameSession.ts';
import {
  Cursor,
  PointerPhase,
  ScreenFlow,
  type FlowControls,
  type GameSelection,
  type PointerInput,
  type Screen,
  type ScreenFactory,
} from '../../src/services/ScreenFlow.ts';

class FakeScreen implements Screen {
  readonly ticksPerSecond = 50;
  cursor: Cursor = Cursor.Default;
  readonly pointers: PointerInput[] = [];
  disposed = false;

  constructor(
    readonly name: string,
    readonly controls: FlowControls,
  ) {}

  tick(): void {}

  present(): void {}

  idle(): void {}

  pointer(input: PointerInput): void {
    this.pointers.push(input);
  }

  key(code: string): boolean {
    return code === 'KeyA';
  }

  suspend(): void {}

  dispose(): void {
    this.disposed = true;
  }
}

function harness(failGame = false) {
  const shown: FakeScreen[] = [];
  const add = (screen: FakeScreen): FakeScreen => {
    shown.push(screen);
    return screen;
  };
  const factory: ScreenFactory = {
    mainMenu: (controls) => add(new FakeScreen('mainMenu', controls)),
    selectWorld: (controls, mode) => add(new FakeScreen(`selectWorld:${mode}`, controls)),
    game: (controls, selection: GameSelection) => {
      if (failGame) throw new Error('unknown room');
      return add(new FakeScreen(`game:${selection.mode}:${selection.roomId}`, controls));
    },
    onlineMenu: (controls, entry) => add(new FakeScreen(`onlineMenu:${entry.mode}:${entry.result?.end ?? ''}`, controls)),
    lobbyRoom: (controls, entry) => add(new FakeScreen(`lobbyRoom:${entry.mode}:${entry.result?.end ?? ''}`, controls)),
    onlineGame: (controls, start) => {
      if (failGame) throw new Error('unknown room');
      return add(new FakeScreen(`online:${start.mode}:${start.playerIndex}`, controls));
    },
  };
  const cursors: Cursor[] = [];
  const flow = new ScreenFlow(factory, silentLogger, (cursor) => cursors.push(cursor));
  const names = (): string[] => shown.map((screen) => screen.name);
  return { flow, shown, names, cursors };
}

const START: GameStarted = {
  type: 'gameStarted',
  matchId: 'm1',
  lobbyId: 'l1',
  mode: GameMode.Coop,
  roomId: 'ROOM_Single_0001',
  options: { difficulty: 0, gameSpeed: 1, devilsActive: true, collisionsActive: true, damageActive: true, gameAmount: 1, detail: true },
  playerIndex: 1,
  ticksPerSecond: 25,
  projectionFactor: -0.5,
};

describe('ScreenFlow online routing', () => {
  it('goes from the online menu into the lobby room, the online game and back to the room or the menu with the result', () => {
    const { flow, names } = harness();
    flow.start();
    flow.openLobby(GameMode.Coop);
    flow.tick();
    flow.enterLobby(GameMode.Coop);
    flow.tick();
    flow.startOnlineGame(START);
    flow.tick();
    flow.finishOnlineGame({ end: OnlineEnd.Finished, state: CompletionState.PlayerDead, gameOver: undefined }, true);
    flow.tick();
    flow.startOnlineGame(START);
    flow.tick();
    flow.finishOnlineGame({ end: OnlineEnd.Lost, state: CompletionState.Error, gameOver: undefined }, false);
    flow.tick();
    expect(names()).toEqual(['mainMenu', 'onlineMenu:coop:', 'lobbyRoom:coop:', 'online:coop:1', 'lobbyRoom:coop:finished', 'online:coop:1', 'onlineMenu:coop:lost']);
  });

  it('falls back to the online menu when the online game cannot start', () => {
    const { flow, names } = harness(true);
    flow.start();
    flow.startOnlineGame(START);
    flow.tick();
    expect(names()).toEqual(['mainMenu', 'onlineMenu:coop:']);
  });
});

describe('ScreenFlow transitions', () => {
  it('boots into the main menu, then select world, game and back to select world in the same mode', () => {
    const { flow, names, shown } = harness();
    flow.start();
    flow.selectWorld(GameMode.DeathMatch);
    flow.present();
    flow.startGame({ mode: GameMode.DeathMatch, roomId: 'ROOM_Single_0003' });
    flow.tick();
    flow.finishGame({ state: CompletionState.Quit, score: 0 });
    flow.tick();
    expect(names()).toEqual(['mainMenu', 'selectWorld:deathMatch', 'game:deathMatch:ROOM_Single_0003', 'selectWorld:deathMatch']);
    expect(shown.slice(0, -1).every((screen) => screen.disposed)).toBe(true);
    expect(flow.selectWorldMode).toBe(GameMode.DeathMatch);
  });

  it('goes back to the main menu (CScreen.GoBack)', () => {
    const { flow, names } = harness();
    flow.start();
    flow.selectWorld(GameMode.Single);
    flow.present();
    flow.showMainMenu();
    flow.present();
    expect(names()).toEqual(['mainMenu', 'selectWorld:single', 'mainMenu']);
  });

  it('returns to select world of the chosen mode when a game cannot be created', () => {
    const { flow, names } = harness(true);
    flow.start();
    flow.startGame({ mode: GameMode.Single, roomId: 'nope' });
    flow.present();
    expect(names()).toEqual(['mainMenu', 'selectWorld:single']);
  });

  it('forwards pointer and key input, replays the last pointer position to a new screen and reports cursor changes', () => {
    const { flow, shown, cursors } = harness();
    flow.start();
    const first = shown[0] as FakeScreen;
    first.cursor = Cursor.Hand;
    flow.pointer({ phase: PointerPhase.Move, point: { x: 10, y: 20 } });
    expect(cursors).toEqual([Cursor.Hand]);
    expect(flow.key('KeyA')).toBe(true);
    expect(flow.key('KeyB')).toBe(false);
    flow.selectWorld(GameMode.Single);
    flow.present();
    const second = shown[1] as FakeScreen;
    expect(second.pointers).toEqual([{ phase: PointerPhase.Move, point: { x: 10, y: 20 } }]);
    expect(cursors).toEqual([Cursor.Hand, Cursor.Default]);
  });
});
