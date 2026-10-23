import { describe, expect, it } from 'vitest';
import { FrameClock } from '../../src/entry/FrameClock.ts';
import { GameLoop, type LoopClock } from '../../src/entry/GameLoop.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { Cursor, ScreenFlow, type Screen, type ScreenFactory } from '../../src/services/ScreenFlow.ts';

describe('FrameClock (CMain.ProcessFrames)', () => {
  it('waits a whole interval before the first tick', () => {
    const clock = new FrameClock();
    expect(clock.process(1000, 25)).toBe(0);
    expect(clock.process(1039, 25)).toBe(0);
    expect(clock.process(1040, 25)).toBe(1);
    expect(clock.process(1079, 25)).toBe(0);
    expect(clock.process(1080, 25)).toBe(1);
  });

  it('caps at one tick per frame and drops the rest of a long stall', () => {
    const clock = new FrameClock();
    clock.reset(0);
    expect(clock.process(400, 25)).toBe(1);
    expect(clock.process(420, 25)).toBe(0);
    expect(clock.process(440, 25)).toBe(1);
  });

  it('uses the game speed and restarts on reset', () => {
    const clock = new FrameClock();
    clock.reset(0);
    expect(clock.process(79, 12.5)).toBe(0);
    expect(clock.process(80, 12.5)).toBe(1);
    clock.reset(1000);
    expect(clock.process(1020, 50)).toBe(1);
  });
});

class CountingScreen implements Screen {
  readonly cursor = Cursor.Default;
  ticks = 0;
  presents = 0;
  idles = 0;
  suspended = 0;
  disposed = false;

  constructor(
    readonly name: string,
    readonly ticksPerSecond: number,
    private readonly onTick: () => void = () => undefined,
  ) {}

  tick(): void {
    this.ticks++;
    this.onTick();
  }

  present(): void {
    this.presents++;
  }

  idle(hasTime: () => boolean): void {
    if (hasTime()) this.idles++;
  }

  pointer(): void {}

  key(): boolean {
    return false;
  }

  suspend(): void {
    this.suspended++;
  }

  dispose(): void {
    this.disposed = true;
  }
}

function fakeTime(): LoopClock & { time: number } {
  return {
    time: 0,
    now() {
      return this.time;
    },
    requestFrame: () => undefined,
  };
}

describe('ScreenFlow and GameLoop', () => {
  it('ticks the active screen at its rate, presents every frame and swaps screens between ticks', () => {
    const screens: CountingScreen[] = [];
    const factory: ScreenFactory = {
      mainMenu: (controls) => {
        const screen = new CountingScreen('mainMenu', 25, () => controls.startGame({ mode: 'single', roomId: 'R' }));
        screens.push(screen);
        return screen;
      },
      selectWorld: () => new CountingScreen('selectWorld', 50),
      onlineMenu: () => new CountingScreen('onlineMenu', 50),
      lobbyRoom: () => new CountingScreen('lobbyRoom', 50),
      onlineGame: () => new CountingScreen('onlineGame', 25),
      game: () => {
        const screen = new CountingScreen('game', 50);
        screens.push(screen);
        return screen;
      },
    };
    const flow = new ScreenFlow(factory, silentLogger);
    flow.start();
    const time = fakeTime();
    const loop = new GameLoop(flow, time);
    loop.frame(0);
    expect(screens[0]?.ticks).toBe(0);
    expect(screens[0]?.presents).toBe(1);
    loop.frame(40);
    expect(screens[0]?.ticks).toBe(1);
    expect(screens[0]?.disposed).toBe(true);
    expect(flow.screen?.name).toBe('game');
    expect(flow.ticksPerSecond).toBe(50);
    loop.frame(50);
    expect(screens[1]?.ticks).toBe(0);
    loop.frame(69);
    expect(screens[1]?.ticks).toBe(0);
    loop.frame(70);
    expect(screens[1]?.ticks).toBe(1);
    expect(screens[1]?.idles).toBeGreaterThan(0);
    flow.suspend();
    expect(screens[1]?.suspended).toBe(1);
  });
});
