import { angleToDirectionIndex, type Angle } from '../math/Angle.ts';
import type { Position } from '../math/Position.ts';
import { OPAQUE_ALPHA, VisualKind, VisualLayer, type CharacterStyle, type CharacterVisual } from '../visuals.ts';
import {
  modelPointToCells,
  projectionFactor,
  sourceFrame,
  type AnimationCatalog,
  type CharacterAnimation,
  type ModelPoint,
} from './AnimationCatalog.ts';

export type CharacterCollection = Readonly<Record<string, string>>;

export interface FrameStep {
  readonly animEnd: boolean;
  readonly newFrame: boolean;
  readonly frameIndex: number;
}

export class CharacterAnimator {
  private linkage: string | undefined;
  private animation: CharacterAnimation | undefined;
  private frameId = 0;
  private ended = false;

  constructor(
    private readonly catalog: AnimationCatalog,
    private readonly collection: CharacterCollection,
    readonly style: CharacterStyle,
  ) {}

  get animationLinkage(): string | undefined {
    return this.linkage;
  }

  get frameCount(): number {
    return this.animation?.frameCount ?? 0;
  }

  get framePosition(): number {
    return this.frameId;
  }

  get frameIndex(): number {
    return Math.trunc(this.frameId);
  }

  get animEnd(): boolean {
    return this.ended;
  }

  setAnimation(animationId: string, frame = 0): void {
    const linkage = this.collection[animationId];
    if (linkage === this.linkage) return;
    this.forceAnimation(animationId, frame);
  }

  forceAnimation(animationId: string, frame = 0): void {
    this.linkage = this.collection[animationId];
    this.animation = this.linkage === undefined ? undefined : this.catalog.characters[this.linkage];
    this.frameId = frame;
    this.animate(0);
  }

  animate(speed: number): boolean {
    const animation = this.animation;
    if (!animation) return false;
    const previous = this.frameId;
    const next = this.frameId + speed;
    this.frameId = next % animation.frameCount;
    this.ended = next >= animation.frameCount && next > previous;
    return this.ended;
  }

  quickAnimate(speed: number): void {
    const animation = this.animation;
    if (!animation) return;
    this.frameId = (this.frameId + speed) % animation.frameCount;
  }

  animateStep(speed: number): FrameStep | undefined {
    const animation = this.animation;
    if (!animation) return undefined;
    const previous = this.frameId;
    const next = this.frameId + speed;
    this.frameId = next % animation.frameCount;
    return {
      animEnd: next >= animation.frameCount && next > previous,
      newFrame: Math.trunc(previous) !== Math.trunc(next),
      frameIndex: Math.trunc(this.frameId),
    };
  }

  directionIndex(angle: Angle): number {
    const animation = this.animation;
    return animation ? angleToDirectionIndex(angle, animation.directionCount) : 0;
  }

  modelPoint(point: ModelPoint, angle: Angle): Position | undefined {
    const animation = this.animation;
    if (!animation) return undefined;
    const raw = animation.modelPoints[this.directionIndex(angle)]?.[sourceFrame(animation, this.frameIndex)]?.[point];
    if (!raw) return undefined;
    return modelPointToCells(raw, projectionFactor(animation.tiltDegrees), this.catalog.modelScale);
  }

  visual(position: Position, angle: Angle, alpha = OPAQUE_ALPHA): CharacterVisual | undefined {
    const animation = this.animation;
    if (!animation || this.linkage === undefined) return undefined;
    return {
      kind: VisualKind.Character,
      layer: VisualLayer.World,
      style: this.style,
      animation: this.linkage,
      direction: this.directionIndex(angle),
      directionCount: animation.directionCount,
      frame: this.frameIndex,
      sourceFrame: sourceFrame(animation, this.frameIndex),
      alpha,
      position: { x: position.x, y: position.y, z: position.z },
    };
  }
}
