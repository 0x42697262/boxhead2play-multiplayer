import { Position } from '../math/Position.ts';
import { CELL_SIZE_PX } from '../map/tuning.ts';

export const InitKind = {
  CollisionSolid: 'CollisionSolid',
  Wall: 'Wall',
  Barrel: 'Barrel',
  Zombie: 'Zombie',
  Devil: 'Devil',
  Player1: 'Player1',
  Player2: 'Player2',
  Pickup: 'Pickup',
  Piece: 'Piece',
} as const;

export type InitKind = (typeof InitKind)[keyof typeof InitKind];

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface RoomInitObject {
  readonly order: number;
  readonly kind: InitKind;
  readonly positionPx: PixelPoint;
  readonly position2Px: PixelPoint;
  readonly rotationDegrees: number;
}

export interface RoomDefinition {
  readonly id: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly initObjects: readonly RoomInitObject[];
}

export function screenToCell(point: PixelPoint): Position {
  return new Position(point.x / CELL_SIZE_PX, point.y / CELL_SIZE_PX, 0);
}

export function initObjectsInOrder(room: RoomDefinition): RoomInitObject[] {
  return room.initObjects.slice().sort((a, b) => a.order - b.order);
}
