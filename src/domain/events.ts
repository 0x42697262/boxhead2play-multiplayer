import type { TextKey } from '../text/i18n.ts';
import type { SoundId } from './sounds.ts';
import type { CompletionState } from './world/CompletionState.ts';

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface Point3 extends Point2 {
  readonly z: number;
}

export interface TextRef {
  readonly key: TextKey;
  readonly params?: Readonly<Record<string, string | number>>;
}

export const DomainEventType = {
  SoundRequested: 'soundRequested',
  AmbienceRequested: 'ambienceRequested',
  AmbienceStopped: 'ambienceStopped',
  DecalRequested: 'decalRequested',
  CameraShaken: 'cameraShaken',
  BrightnessFlashed: 'brightnessFlashed',
  ScoreAwarded: 'scoreAwarded',
  HudMessage: 'hudMessage',
  PauseChanged: 'pauseChanged',
  WorldCompleted: 'worldCompleted',
} as const;

export const DecalKind = {
  BloodSplat: 'bloodSplat',
  ScorchMark: 'scorchMark',
} as const;

export type DecalKind = (typeof DecalKind)[keyof typeof DecalKind];

export const MessageTone = {
  Info: 'info',
  Level: 'level',
  Upgrade: 'upgrade',
  Critical: 'critical',
} as const;

export type MessageTone = (typeof MessageTone)[keyof typeof MessageTone];

export interface SoundRequested {
  readonly type: typeof DomainEventType.SoundRequested;
  readonly sound: SoundId;
  readonly position?: Point3;
}

export interface AmbienceRequested {
  readonly type: typeof DomainEventType.AmbienceRequested;
  readonly sound: SoundId;
  readonly maxChannels: number;
}

export interface AmbienceStopped {
  readonly type: typeof DomainEventType.AmbienceStopped;
}

export interface DecalRequested {
  readonly type: typeof DomainEventType.DecalRequested;
  readonly decal: DecalKind;
  readonly symbol: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly frame: number;
  readonly rotationIndex: number;
  readonly rotationCount: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CameraShaken {
  readonly type: typeof DomainEventType.CameraShaken;
  readonly dx: number;
  readonly dy: number;
}

export interface BrightnessFlashed {
  readonly type: typeof DomainEventType.BrightnessFlashed;
  readonly brightness: number;
}

export interface ScoreAwarded {
  readonly type: typeof DomainEventType.ScoreAwarded;
  readonly points: number;
  readonly worldPosition: Point3;
  readonly screenPosition: Point2;
}

export interface HudMessage {
  readonly type: typeof DomainEventType.HudMessage;
  readonly tone: MessageTone;
  readonly text: TextRef;
  readonly playerIndex?: number;
}

export interface PauseChanged {
  readonly type: typeof DomainEventType.PauseChanged;
  readonly paused: boolean;
}

export interface WorldCompleted {
  readonly type: typeof DomainEventType.WorldCompleted;
  readonly state: CompletionState;
}

export type DomainEvent =
  | SoundRequested
  | AmbienceRequested
  | AmbienceStopped
  | DecalRequested
  | CameraShaken
  | BrightnessFlashed
  | ScoreAwarded
  | HudMessage
  | PauseChanged
  | WorldCompleted;

export interface EventSink {
  emit(event: DomainEvent): void;
}

export class EventQueue implements EventSink {
  private pending: DomainEvent[] = [];

  emit(event: DomainEvent): void {
    this.pending.push(event);
  }

  drain(): DomainEvent[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }

  get size(): number {
    return this.pending.length;
  }
}
