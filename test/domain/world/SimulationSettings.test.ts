import { describe, expect, it } from 'vitest';
import { EventQueue, DomainEventType } from '../../../src/domain/events.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { createSimulationSettings, DEFAULT_GAME_OPTIONS, GameSpeed } from '../../../src/domain/world/SimulationSettings.ts';

describe('SimulationSettings', () => {
  it('derives ticks per second from the game speed, with slow at half speed', () => {
    expect(createSimulationSettings({ ...DEFAULT_GAME_OPTIONS, gameSpeed: GameSpeed.Slow }).ticksPerSecond).toBe(12.5);
    expect(createSimulationSettings({ ...DEFAULT_GAME_OPTIONS, gameSpeed: GameSpeed.Normal }).ticksPerSecond).toBe(25);
    expect(createSimulationSettings({ ...DEFAULT_GAME_OPTIONS, gameSpeed: GameSpeed.Fast }).ticksPerSecond).toBe(50);
  });

  it('forces damage on in deathmatch and freezes the result', () => {
    const settings = createSimulationSettings({ ...DEFAULT_GAME_OPTIONS, gameMode: GameMode.DeathMatch, damageActive: false });
    expect(settings.damageActive).toBe(true);
    expect(Object.isFrozen(settings)).toBe(true);
  });
});

describe('EventQueue', () => {
  it('drains events in emission order', () => {
    const queue = new EventQueue();
    queue.emit({ type: DomainEventType.CameraShaken, dx: 0, dy: 30 });
    queue.emit({ type: DomainEventType.BrightnessFlashed, brightness: 1 });
    expect(queue.drain().map((event) => event.type)).toEqual([DomainEventType.CameraShaken, DomainEventType.BrightnessFlashed]);
    expect(queue.size).toBe(0);
  });
});
