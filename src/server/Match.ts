import { SeededRng } from '../domain/math/Rng.ts';
import type { CompletionState } from '../domain/world/CompletionState.ts';
import { IDLE_TICK_INPUT, type PlayerInput } from '../domain/world/input.ts';
import type { PlayerCharacter } from '../domain/world/SimulationSettings.ts';
import { createSimulationSettings, SERVER_SIMULATION_HOST } from '../domain/world/SimulationSettings.ts';
import type { MultiplierListEntry } from '../domain/upgrades/Upgrades.ts';
import { World } from '../domain/world/World.ts';
import { RemoteControls, type ControlMasks } from '../net/controlMask.ts';
import { netFrameFor } from '../net/frames.ts';
import { gameOptionsFor, type LobbyOptions, type NetFrame, type OnlineMode } from '../net/protocol.ts';
import type { GameContent } from './ports.ts';

export interface MatchSetup {
  readonly id: string;
  readonly mode: OnlineMode;
  readonly roomId: string;
  readonly options: LobbyOptions;
  readonly characters: readonly PlayerCharacter[];
  readonly seed: number;
}

export interface MatchResult {
  readonly state: CompletionState;
  readonly winnerIndex: number | undefined;
  readonly score: number;
}

export interface MatchStep {
  readonly frames: ReadonlyMap<number, NetFrame>;
  readonly upgrades: readonly MultiplierListEntry[] | undefined;
  readonly result: MatchResult | undefined;
}

export class Match {
  readonly world: World;
  private readonly controls = new Map<number, RemoteControls>();
  private upgradesKey = '';

  private constructor(
    readonly setup: MatchSetup,
    world: World,
  ) {
    this.world = world;
    setup.characters.forEach((_character, index) => this.controls.set(index, new RemoteControls()));
    world.events.drain();
  }

  static start(setup: MatchSetup, content: GameContent): Match | undefined {
    const room = content.rooms.get(setup.roomId);
    if (!room) return undefined;
    const settings = createSimulationSettings(gameOptionsFor(setup.mode, setup.options, setup.characters), SERVER_SIMULATION_HOST);
    const world = World.create(room, settings, { rng: new SeededRng(setup.seed), factory: content.factory, animations: content.animations });
    return new Match(setup, world);
  }

  get ticksPerSecond(): number {
    return this.world.ticksPerSecond;
  }

  get playerIndexes(): number[] {
    return [...this.controls.keys()];
  }

  get upgrades(): readonly MultiplierListEntry[] {
    return this.world.upgrades.multiplierList();
  }

  join(character: PlayerCharacter): number | undefined {
    const index = this.world.freePlayerIndex();
    if (index === undefined || !this.world.joinPlayer(index, character)) return undefined;
    this.controls.set(index, new RemoteControls());
    return index;
  }

  leave(playerIndex: number): void {
    this.world.leavePlayer(playerIndex);
    this.controls.delete(playerIndex);
  }

  input(playerIndex: number, masks: ControlMasks): void {
    this.controls.get(playerIndex)?.receive(masks);
  }

  releaseControls(playerIndex: number): void {
    this.controls.get(playerIndex)?.releaseAll();
  }

  step(): MatchStep {
    const players: PlayerInput[] = [];
    for (const [index, controls] of this.controls) players[index] = controls.sample();
    this.world.update({ ...IDLE_TICK_INPUT, players });
    const events = this.world.events.drain();
    const frames = new Map<number, NetFrame>();
    for (const index of this.controls.keys()) {
      const frame = netFrameFor(this.world, index, events);
      if (frame) frames.set(index, frame);
    }
    return { frames, upgrades: this.changedUpgrades(), result: this.result() };
  }

  private changedUpgrades(): readonly MultiplierListEntry[] | undefined {
    const upgrades = this.upgrades;
    const key = JSON.stringify(upgrades);
    if (key === this.upgradesKey) return undefined;
    this.upgradesKey = key;
    return upgrades;
  }

  private result(): MatchResult | undefined {
    const state = this.world.completion;
    if (!state) return undefined;
    return { state, winnerIndex: this.world.winnerIndex, score: this.world.hud.totalScore };
  }
}
