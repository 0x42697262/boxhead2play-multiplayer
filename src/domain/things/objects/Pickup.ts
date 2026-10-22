import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Position } from '../../math/Position.ts';
import { CollideFlag } from '../../map/CollideFlag.ts';
import type { MapCell } from '../../map/MapCell.ts';
import { SoundId } from '../../sounds.ts';
import { OPAQUE_ALPHA, type Visual } from '../../visuals.ts';
import { GameMode } from '../../world/GameMode.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { isPlayer } from '../PlayerThing.ts';
import { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { PICKUP } from './tuning.ts';

export const PickupPhase = {
  Init: 'init',
  Waiting: 'waiting',
  Reappearing: 'reappearing',
  DroppedInit: 'droppedInit',
  Dropped: 'dropped',
} as const;

export type PickupPhase = (typeof PickupPhase)[keyof typeof PickupPhase];

export class Pickup extends Thing {
  readonly classId = ThingClass.Pickup;
  alpha = OPAQUE_ALPHA;
  deleteOnPickup = false;
  reappearCount = 0;
  deleteCounter = 0;
  phase: PickupPhase = PickupPhase.Init;
  currentCell: MapCell | undefined = undefined;
  private readonly animator: ClipAnimator;

  constructor(world: WorldContext, position: Position) {
    super(world, position.cellCentre());
    this.animator = clipAnimator(world.animations, ClipSymbol.Pickup);
  }

  static dropped(world: WorldContext, position: Position, lifetimeTicks: number): Pickup {
    const pickup = new Pickup(world, position);
    pickup.deleteOnPickup = true;
    pickup.setDeleteCounter(lifetimeTicks);
    return pickup;
  }

  setDeleteCounter(ticks: number): void {
    this.deleteCounter = ticks;
    this.phase = PickupPhase.DroppedInit;
  }

  process(): void {
    switch (this.phase) {
      case PickupPhase.Init:
        this.world.map.mapwho.addThing(this);
        this.currentCell = this.cellHere();
        this.phase = PickupPhase.Waiting;
        this.checkCollect();
        return;
      case PickupPhase.Waiting:
        this.checkCollect();
        return;
      case PickupPhase.Reappearing:
        if (--this.reappearCount < 0) this.phase = PickupPhase.Init;
        return;
      case PickupPhase.DroppedInit:
        this.world.map.mapwho.moveThing(this);
        this.currentCell = this.cellHere();
        this.phase = PickupPhase.Dropped;
        return;
      case PickupPhase.Dropped:
        this.processDropped();
        return;
    }
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.Pickup, this.animator, this.position, this.alpha);
  }

  private cellHere(): MapCell | undefined {
    return this.world.map.cellAt(this.position.x, this.position.y);
  }

  private processDropped(): void {
    if (--this.deleteCounter < 0) {
      this.delete();
      return;
    }
    const fadeTicks = this.world.ticksPerSecond * PICKUP.fadeSeconds;
    if (this.deleteCounter < fadeTicks) this.alpha = (this.deleteCounter / fadeTicks) * OPAQUE_ALPHA;
    this.checkCollect();
  }

  private checkCollect(): void {
    if ((this.currentCell?.collide ?? CollideFlag.None) & CollideFlag.Player) this.pickedUp();
  }

  private pickedUp(): void {
    const player = this.currentCell?.findClass(ThingClass.Player);
    if (player && isPlayer(player)) {
      if (player.hasFlag(ThingFlag.Dead)) return;
      player.randomPickup();
    }
    this.playSound(SoundId.Pickup);
    if (this.deleteOnPickup) {
      this.delete();
      return;
    }
    this.world.map.mapwho.deleteThing(this);
    const seconds = this.world.settings.gameMode === GameMode.DeathMatch ? PICKUP.deathMatchReappearSeconds : PICKUP.reappearSeconds;
    this.reappearCount = this.world.ticksPerSecond * seconds;
    this.phase = PickupPhase.Reappearing;
  }
}
