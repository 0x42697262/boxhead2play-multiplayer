import { DomainEventType } from '../events.ts';
import { Angle } from '../math/Angle.ts';
import type { Position } from '../math/Position.ts';
import type { CellId } from '../map/CellRect.ts';
import type { SoundId } from '../sounds.ts';
import type { Visual } from '../visuals.ts';
import type { WorldContext } from '../world/WorldContext.ts';
import type { Affect } from './affects/Affect.ts';
import { baseClassOf, type ThingBaseClass, type ThingClass } from './ThingClass.ts';
import { GROW_RADIUS_STEP } from './tuning.ts';

export interface ThingOptions {
  readonly angle?: Angle;
  readonly parent?: Thing;
}

export abstract class Thing {
  abstract readonly classId: ThingClass;
  readonly uniqueId: number;
  readonly key: string;
  readonly parent: Thing | undefined;
  id: number;
  position: Position;
  angle: Angle;
  flags = 0;
  affectFlags = 0;
  affectors: Affect[] = [];
  radius = 0;
  radiusSquared = 0;
  height = 0;
  score = 0;
  collidedWithId: number | undefined = undefined;
  cellId: CellId | undefined = undefined;
  private processing = true;

  constructor(
    readonly world: WorldContext,
    position: Position,
    options: ThingOptions = {},
  ) {
    this.position = position;
    this.angle = options.angle ?? new Angle(0);
    this.parent = options.parent;
    this.uniqueId = world.ids.allocate();
    this.key = `t${this.uniqueId}`;
    this.id = this.parent ? this.parent.id : this.uniqueId;
  }

  get baseClass(): ThingBaseClass {
    return baseClassOf(this.classId);
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  abstract process(): void;

  visual(): Visual | undefined {
    return undefined;
  }

  hasFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  makeIdUnique(): void {
    this.id = this.uniqueId;
  }

  setRadius(radius: number): void {
    this.radius = radius;
    this.radiusSquared = radius * radius;
  }

  growRadius(target: number): boolean {
    if (this.radius >= target) return false;
    this.setRadius(this.radius + GROW_RADIUS_STEP);
    return true;
  }

  delete(): void {
    this.stopProcessing();
    this.world.things.deleteThing(this);
  }

  stopProcessing(): void {
    this.processing = false;
  }

  resumeProcessing(): void {
    this.processing = true;
  }

  move(next: Position): boolean {
    if (next !== this.position) this.position.set(next);
    return this.world.map.mapwho.moveThing(this);
  }

  affectSetup(flags: number): void {
    this.affectors = [];
    this.affectFlags = flags;
  }

  affect(affect: Affect): void {
    this.affectors.push(affect);
  }

  clearAffects(): void {
    this.affectFlags = 0;
  }

  playSound(sound: SoundId): void {
    const { x, y, z } = this.position;
    this.world.events.emit({ type: DomainEventType.SoundRequested, sound, position: { x, y, z } });
  }

  dispose(): void {
    this.world.map.mapwho.deleteThing(this);
  }
}
