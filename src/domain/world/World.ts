import { worldProjectionFactor, type AnimationCatalog } from '../animation/AnimationCatalog.ts';
import { DomainEventType, EventQueue, MessageTone, type Point2, type Point3 } from '../events.ts';
import { killMessage } from '../hud/killMessage.ts';
import { HudState } from '../hud/HudState.ts';
import { Angle } from '../math/Angle.ts';
import type { Position } from '../math/Position.ts';
import type { Rng } from '../math/Rng.ts';
import { CollideFlag, CollideMask } from '../map/CollideFlag.ts';
import { GameMap } from '../map/GameMap.ts';
import { NAV_FRESHNESS_SECONDS } from '../map/tuning.ts';
import { isPlayer, type PlayerThing } from '../things/PlayerThing.ts';
import type { Thing } from '../things/Thing.ts';
import { ThingClass } from '../things/ThingClass.ts';
import { ThingCollection } from '../things/ThingCollection.ts';
import { ThingFlag } from '../things/ThingFlag.ts';
import type { ThingFactory } from '../things/ThingFactory.ts';
import { ThingIds } from '../things/ThingIds.ts';
import { Upgrades, type UpgradesHost } from '../upgrades/Upgrades.ts';
import type { DrawEntry } from '../visuals.ts';
import { INITIAL_AMBIENCE, stepAmbience, type AmbienceState } from './ambience.ts';
import { cellToScreen, panFreeCamera, trackCamera, type CameraArea, type CameraRect } from './camera.ts';
import { CameraEffects, NO_CAMERA_EFFECTS, type CameraEffectsView } from './CameraEffects.ts';
import type { ScreenEffects } from './ScreenEffects.ts';
import { CompletionState } from './CompletionState.ts';
import { GameMode } from './GameMode.ts';
import { IDLE_PLAYER_INPUT, IDLE_TICK_INPUT, type PlayerInput, type TickInput } from './input.ts';
import { initObjectsInOrder, InitKind, screenToCell, type RoomDefinition, type RoomInitObject } from './RoomDefinition.ts';
import type { PlayerCharacter, SimulationSettings } from './SimulationSettings.ts';
import {
  type CellPoint,
  openSpawnNear,
  pickPlayerSpawnCell,
  pickSpawnPoint,
  pickSpawnPointNonStrict,
  type PlayerSpawnFloor,
  playerSpawnFloor,
  reachableFloor,
  standablePlayerPoints,
  type SpawnPoint,
  validateSpawnPoints,
} from './spawning.ts';
import {
  DROPPED_PICKUP_SECONDS,
  INITIAL_BRIGHTNESS,
  KILLS_TO_WIN,
  MAX_PLAYERS,
  OPEN_SPAWN_SEARCH_CELLS,
  PICKUP_EVERY_N_KILLS,
  PLAYER_SPAWN_CANDIDATES,
  PLAYER_SPAWN_DOOR_CLEARANCE_CELLS,
  SCREEN_HEIGHT_PX,
  SCREEN_WIDTH_PX,
} from './tuning.ts';
import type { WorldContext } from './WorldContext.ts';

export interface WorldDependencies {
  readonly rng: Rng;
  readonly factory: ThingFactory;
  readonly animations: AnimationCatalog;
  readonly events?: EventQueue;
  readonly spawnRng?: Rng;
}

export interface CameraView {
  readonly playerIndex: number;
  readonly rect: CameraRect;
  readonly drawOrigin: Point2;
}

export interface Presentation {
  readonly cameras: readonly CameraView[];
  readonly effects: ReadonlyMap<number, CameraEffectsView>;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

const PLAYER_SPAWN_BLOCKED = CollideFlag.Player | CollideMask.StaticImpassable;

function isLivingEnemy(thing: Thing): boolean {
  return (thing.classId === ThingClass.Zombie || thing.classId === ThingClass.Devil) && thing.isProcessing && !thing.hasFlag(ThingFlag.Dead);
}

export class World implements WorldContext, UpgradesHost {
  readonly events: EventQueue;
  readonly rng: Rng;
  readonly factory: ThingFactory;
  readonly animations: AnimationCatalog;
  readonly projectionFactor: number;
  readonly ids = new ThingIds();
  readonly map: GameMap;
  readonly hud: HudState;
  readonly upgrades: Upgrades;
  readonly things: ThingCollection;
  tick = 0;
  private currentTicksPerSecond: number;
  private completionState: CompletionState | undefined = undefined;
  private winner: number | undefined = undefined;
  private tickInput: TickInput = IDLE_TICK_INPUT;
  private zombiePoints: SpawnPoint[] = [];
  private devilPoints: SpawnPoint[] = [];
  private playerPoints: SpawnPoint[] = [];
  private playerStart: SpawnPoint | undefined = undefined;
  private playerFloor: PlayerSpawnFloor = { awayFromDoors: [], all: [] };
  private doorCells: readonly CellPoint[] = [];
  private readonly spawnRng: Rng;
  private readonly trackTargets = new Map<number, Point3>();
  private readonly lastTracked = new Map<number, Point3>();
  private readonly freeCameras = new Map<number, Point3>();
  private ambience: AmbienceState = INITIAL_AMBIENCE;
  private readonly screens = new CameraEffects();
  private view: Presentation = { cameras: [], effects: new Map() };
  private drawOrigin: Point2 = { x: 0, y: 0 };

  constructor(
    readonly room: RoomDefinition,
    readonly settings: SimulationSettings,
    dependencies: WorldDependencies,
  ) {
    this.rng = dependencies.rng;
    this.spawnRng = dependencies.spawnRng ?? dependencies.rng;
    this.factory = dependencies.factory;
    this.animations = dependencies.animations;
    this.events = dependencies.events ?? new EventQueue();
    this.projectionFactor = worldProjectionFactor(this.animations);
    this.currentTicksPerSecond = settings.loadTicksPerSecond;
    this.map = new GameMap({
      widthPx: room.widthPx,
      heightPx: room.heightPx,
      collisionsActive: settings.collisionsActive,
      rng: this.rng,
      events: this.events,
      animations: this.animations,
      navFreshnessTicks: () => NAV_FRESHNESS_SECONDS * this.currentTicksPerSecond,
    });
    this.hud = new HudState(this.events, this);
    this.upgrades = new Upgrades(this);
    this.ids.renew();
    this.things = new ThingCollection(this.map);
    this.initThings();
  }

  static create(room: RoomDefinition, settings: SimulationSettings, dependencies: WorldDependencies): World {
    const world = new World(room, settings, dependencies);
    world.start();
    return world;
  }

  get ticksPerSecond(): number {
    return this.currentTicksPerSecond;
  }

  get completion(): CompletionState | undefined {
    return this.completionState;
  }

  get winnerIndex(): number | undefined {
    return this.winner;
  }

  get presentation(): Presentation {
    return this.view;
  }

  get spawnPoints(): { readonly zombies: readonly SpawnPoint[]; readonly devils: readonly SpawnPoint[]; readonly players: readonly SpawnPoint[] } {
    return { zombies: this.zombiePoints, devils: this.devilPoints, players: this.playerPoints };
  }

  start(): void {
    this.step();
    this.upgrades.setDifficulty(this.settings.difficulty);
    if (this.settings.gameMode === GameMode.DeathMatch) {
      for (const player of this.things.players()) player.resetWeapons();
    }
    this.currentTicksPerSecond = this.settings.ticksPerSecond;
  }

  update(input: TickInput = IDLE_TICK_INPUT): void {
    if (this.completionState) return;
    this.tickInput = input;
    if (input.quitRequested) this.complete(CompletionState.Quit);
    this.step();
    if (this.completionState) this.events.emit({ type: DomainEventType.WorldCompleted, state: this.completionState });
  }

  cameraFor(playerIndex: number): CameraView | undefined {
    return this.view.cameras.find((camera) => camera.playerIndex === playerIndex);
  }

  effectsFor(playerIndex: number): CameraEffectsView {
    return this.view.effects.get(playerIndex) ?? NO_CAMERA_EFFECTS;
  }

  freePlayerIndex(): number | undefined {
    const taken = new Set(this.things.players().map((player) => player.playerIndex));
    return Array.from({ length: MAX_PLAYERS }, (_unused, index) => index).find((index) => !taken.has(index));
  }

  joinPlayer(playerIndex: number, character: PlayerCharacter): boolean {
    if (this.things.playerByIndex(playerIndex) || playerIndex >= MAX_PLAYERS) return false;
    if (!this.spawnPlayer(playerIndex, character, this.unoccupied(this.playerRespawnPoint()), 0)) return false;
    this.hud.resetPlayer(playerIndex);
    this.hud.addMessage(MessageTone.Joined, { key: 'hud.joined' }, undefined, { player: playerIndex });
    return true;
  }

  leavePlayer(playerIndex: number): boolean {
    const player = this.things.playerByIndex(playerIndex);
    if (!player) return false;
    if (!player.deathLogged) this.upgrades.playerCount--;
    this.upgrades.totalPlayerCount--;
    player.delete();
    this.trackTargets.delete(playerIndex);
    this.lastTracked.delete(playerIndex);
    this.freeCameras.delete(playerIndex);
    this.screens.close(playerIndex);
    return true;
  }

  drawList(camera: CameraView): DrawEntry[] {
    const entries: DrawEntry[] = [];
    for (const thing of this.map.drawOrder(camera.rect)) {
      const visual = thing.visual();
      if (!visual) continue;
      const { x, y, z } = thing.position;
      entries.push({ thingKey: thing.key, sortFloor: thing.hasFlag(ThingFlag.SortFloor), position: { x, y, z }, visual });
    }
    return entries;
  }

  screenPosition(position: Position): Point2 {
    const screen = cellToScreen(position, this.projectionFactor);
    return { x: screen.x - this.drawOrigin.x, y: screen.y - this.drawOrigin.y };
  }

  input(playerIndex: number): PlayerInput {
    return this.tickInput.players[playerIndex] ?? IDLE_PLAYER_INPUT;
  }

  enemiesAlive(): boolean {
    return this.things.count(ThingClass.Zombie) > 0 || this.things.count(ThingClass.Devil) > 0;
  }

  players(): readonly PlayerThing[] {
    return this.things.players();
  }

  spawnZombie(): boolean {
    const point = pickSpawnPoint(this.zombiePoints, this.rng);
    if (!point) return false;
    this.upgrades.zombieSpawned();
    this.things.add(this.factory.zombie(this, point.position.clone()));
    return true;
  }

  spawnDevil(): boolean {
    const point = pickSpawnPointNonStrict(this.devilPoints, this.rng);
    if (!point) return false;
    this.upgrades.devilSpawned();
    this.things.add(this.factory.devil(this, point.position.clone()));
    return true;
  }

  playerRespawnPoint(): SpawnPoint | undefined {
    const cell = pickPlayerSpawnCell({ floor: this.playerFloor, rng: this.spawnRng, enemies: this.enemyCells(), candidates: PLAYER_SPAWN_CANDIDATES });
    if (!cell) return undefined;
    const angle = this.playerStart?.angle.clone() ?? new Angle(0);
    return { position: cell.centre.clone(), cell, angle, nextCell: cell.validMoveNeighbour() };
  }

  logKill(thing: Thing): void {
    switch (thing.classId) {
      case ThingClass.Zombie:
        this.upgrades.zombieKilled();
        if (this.upgrades.multipleKill % PICKUP_EVERY_N_KILLS === 0) this.createPickup(thing.position);
        break;
      case ThingClass.Devil:
        this.upgrades.devilKilled();
        this.createPickup(thing.position);
        break;
      case ThingClass.Player:
        this.upgrades.playerCount--;
        this.recordPlayerDeath(thing);
        if (this.settings.gameMode === GameMode.DeathMatch) this.createPickup(thing.position);
        return;
      default:
        break;
    }
    const { x, y, z } = thing.position;
    this.hud.addScore(thing.score * this.upgrades.multiplier, { x, y, z }, this.screenPosition(thing.position), this.settings.detail);
  }

  playerDead(): void {
    if (this.settings.gameMode === GameMode.DeathMatch) {
      const killsToWin = KILLS_TO_WIN[this.settings.gameAmount];
      const leader = this.things.players().find((player) => this.hud.fragsOf(player.playerIndex) >= killsToWin);
      if (leader) {
        this.winner = leader.playerIndex;
        this.complete(CompletionState.PlayerWon);
      }
    } else if (this.upgrades.playerCount <= 0) {
      this.complete(CompletionState.PlayerDead);
    }
  }

  trackPlayer(player: PlayerThing): void {
    const { x, y, z } = player.position;
    this.trackTargets.set(player.playerIndex, { x, y, z });
  }

  shake(source: Point3, dx: number, dy: number): void {
    for (const effects of this.screensSeeing(source)) effects.shake(dx, dy);
    this.events.emit({ type: DomainEventType.CameraShaken, dx, dy });
  }

  flashBrightness(source: Point3, level: number): void {
    for (const effects of this.screensSeeing(source)) effects.flash(level);
    this.events.emit({ type: DomainEventType.BrightnessFlashed, brightness: level });
  }

  complete(state: CompletionState): void {
    this.completionState = state;
  }

  createPickup(position: Position): void {
    if (this.map.collideAt(position.x, position.y) & CollideMask.StaticImpassable) return;
    this.things.add(this.factory.droppedPickup(this, position.clone(), this.ticksPerSecond * DROPPED_PICKUP_SECONDS));
  }

  private step(): void {
    this.things.process();
    this.upgrades.process();
    this.tick++;
    this.present();
  }

  private screensSeeing(source: Point3): ScreenEffects[] {
    return this.screens.seeing(this.view.cameras, cellToScreen(source, this.projectionFactor));
  }

  private present(): void {
    const indexes = this.playerIndexes();
    this.screens.keepOnly(indexes);
    for (const index of indexes) this.screens.of(index).decayShake();
    const cameras = this.playerCameras(indexes);
    const first = cameras[0];
    if (first) this.drawOrigin = first.drawOrigin;
    const effects = new Map(cameras.map((camera) => [camera.playerIndex, this.presentEffects(camera.playerIndex)] as const));
    this.hud.pruneMessages();
    if (this.settings.presentAmbience) this.presentAmbience(cameras);
    this.view = { cameras, effects };
    this.trackTargets.clear();
  }

  private presentEffects(playerIndex: number): CameraEffectsView {
    const screen = this.screens.of(playerIndex);
    const brightness = this.settings.detail ? screen.decayBrightness() : 0;
    return { shake: { x: screen.shakeX, y: screen.shakeY }, brightness };
  }

  private playerIndexes(): number[] {
    return this.things
      .players()
      .map((player) => player.playerIndex)
      .sort((first, second) => first - second);
  }

  private presentAmbience(cameras: readonly CameraView[]): void {
    const visibleZombies = new Set<Thing>();
    for (const camera of cameras) {
      for (const thing of this.map.drawOrder(camera.rect)) if (thing.classId === ThingClass.Zombie) visibleZombies.add(thing);
    }
    const ambience = stepAmbience(this.ambience, visibleZombies.size, this.tickInput.ambienceSamplesPlaying);
    this.ambience = ambience.state;
    for (const event of ambience.events) this.events.emit(event);
  }

  private playerCameras(indexes: readonly number[]): CameraView[] {
    const smooth = this.settings.gameMode !== GameMode.DeathMatch;
    const area = this.cameraArea();
    return indexes.map((index) => {
      const free = this.freeCamera(index, area);
      const result = trackCamera({
        target: free ?? (smooth ? this.trackTargets.get(index) : this.lockedTarget(index)),
        last: this.lastTracked.get(index),
        smooth: smooth && free === undefined,
        ...area,
      });
      if (result.tracked) this.lastTracked.set(index, result.tracked);
      return this.cameraView(index, result.rect);
    });
  }

  private cameraArea(): CameraArea {
    return {
      viewWidth: SCREEN_WIDTH_PX,
      viewHeight: SCREEN_HEIGHT_PX,
      areaWidthPx: this.room.widthPx,
      areaHeightPx: this.room.heightPx,
      projectionFactor: this.projectionFactor,
    };
  }

  private freeCamera(playerIndex: number, area: CameraArea): Point3 | undefined {
    const player = this.things.playerByIndex(playerIndex);
    if (this.trackTargets.has(playerIndex) || !player?.hasFlag(ThingFlag.Dead)) {
      this.freeCameras.delete(playerIndex);
      return undefined;
    }
    const start = this.freeCameras.get(playerIndex) ?? this.lastTracked.get(playerIndex) ?? player.position;
    const controls = this.tickInput.players[playerIndex] ?? IDLE_PLAYER_INPUT;
    const moved = panFreeCamera(
      { x: start.x, y: start.y, z: start.z },
      { up: controls.up.down, down: controls.down.down, left: controls.left.down, right: controls.right.down },
      area,
    );
    this.freeCameras.set(playerIndex, moved);
    return moved;
  }

  private lockedTarget(playerIndex: number): Point3 | undefined {
    const tracked = this.trackTargets.get(playerIndex);
    if (tracked) return tracked;
    const player = this.things.playerByIndex(playerIndex);
    return player && this.lastTracked.has(playerIndex) ? { x: player.position.x, y: player.position.y, z: player.position.z } : undefined;
  }

  private cameraView(playerIndex: number, rect: CameraRect): CameraView {
    const screen = this.screens.of(playerIndex);
    return {
      playerIndex,
      rect,
      drawOrigin: { x: rect.x + screen.shakeX, y: rect.y + screen.shakeY },
    };
  }

  private recordPlayerDeath(thing: Thing): void {
    if (!isPlayer(thing)) return;
    this.hud.recordDeath({ victim: thing.playerIndex, killer: thing.lastAttackerIndex });
    const message = killMessage({ victim: thing.playerIndex, killer: thing.lastAttackerIndex, killerClass: thing.lastAttackerClass });
    this.hud.addMessage(MessageTone.Critical, message.text, undefined, message.names);
  }

  private initThings(): void {
    for (const init of initObjectsInOrder(this.room)) this.initObject(init);
    this.zombiePoints = validateSpawnPoints(this.zombiePoints);
    this.devilPoints = validateSpawnPoints(this.devilPoints);
    this.playerPoints = standablePlayerPoints(this.playerPoints);
    if (this.playerStart && !this.playerPoints.includes(this.playerStart)) this.playerStart = undefined;
    const markers = this.playerStart ? [this.playerStart, ...this.playerPoints.filter((point) => point !== this.playerStart)] : this.playerPoints;
    this.doorCells = [...this.zombiePoints, ...this.devilPoints].map((point) => point.cell);
    this.playerFloor = playerSpawnFloor(
      reachableFloor(markers.map((point) => point.cell)),
      this.doorCells,
      PLAYER_SPAWN_DOOR_CLEARANCE_CELLS,
    );
    this.settings.playerCharacters.forEach((character, index) => {
      this.spawnPlayer(index, character, this.unoccupied(this.playerRespawnPoint()), INITIAL_BRIGHTNESS);
    });
  }

  private initObject(init: RoomInitObject): void {
    const position = screenToCell(init.positionPx);
    const position2 = screenToCell(init.position2Px);
    switch (init.kind) {
      case InitKind.CollisionSolid:
        position.round();
        position2.round();
        this.map.markArea(position.x, position.y, position2.x, position2.y, CollideFlag.Solid);
        return;
      case InitKind.Barrel:
        this.things.add(this.factory.barrel(this, position.snapToCellCentre()));
        return;
      case InitKind.Wall:
        this.things.add(this.factory.wall(this, position.snapToCellCentre()));
        return;
      case InitKind.Zombie:
        this.addSpawnPoint(this.zombiePoints, position.snapToCellCentre(), new Angle(0));
        return;
      case InitKind.Devil:
        this.addSpawnPoint(this.devilPoints, position.snapToCellCentre(), new Angle(0));
        return;
      case InitKind.Player1:
      case InitKind.Player2: {
        const point = this.addSpawnPoint(this.playerPoints, position.snapToCellCentre(), new Angle(init.rotationDegrees * DEGREES_TO_RADIANS));
        if (point && init.kind === InitKind.Player1) this.playerStart = point;
        return;
      }
      case InitKind.Pickup:
        this.things.add(this.factory.pickup(this, position));
        return;
      case InitKind.Piece:
        return;
    }
  }

  private enemyCells(): CellPoint[] {
    const enemies = this.things.filter(isLivingEnemy).map((enemy) => ({ x: enemy.position.cellX, y: enemy.position.cellY }));
    return [...enemies, ...this.doorCells];
  }

  private unoccupied(point: SpawnPoint | undefined): SpawnPoint | undefined {
    const origin = point ?? this.playerStart ?? this.playerPoints[0];
    if (!origin) return undefined;
    const occupied = new Set(this.things.players().map((player) => this.map.cellAt(player.position.x, player.position.y)));
    if (point && !occupied.has(point.cell) && !(point.cell.collide & PLAYER_SPAWN_BLOCKED)) return point;
    return openSpawnNear(origin, new Set([...occupied].filter((cell) => cell !== undefined)), OPEN_SPAWN_SEARCH_CELLS);
  }

  private addSpawnPoint(list: SpawnPoint[], position: Position, angle: Angle): SpawnPoint | undefined {
    const cell = this.map.cellAt(position.x, position.y);
    if (!cell) return undefined;
    const point: SpawnPoint = { position, cell, angle, nextCell: undefined };
    list.push(point);
    return point;
  }

  private spawnPlayer(playerIndex: number, character: PlayerCharacter, point: SpawnPoint | undefined, brightness: number): boolean {
    if (!point) return false;
    this.screens.open(playerIndex, brightness);
    this.upgrades.totalPlayerCount++;
    this.upgrades.playerCount++;
    this.things.addPlayer(this.factory.player(this, point.position.clone(), playerIndex, point.angle.clone(), character));
    return true;
  }
}
