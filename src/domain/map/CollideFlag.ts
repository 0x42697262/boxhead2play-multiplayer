export const CollideFlag = {
  None: 0,
  Solid: 1,
  Ledge: 2,
  Shot: 4,
  Path: 8,
  Road: 16,
  Creature: 32,
  Player: 64,
  Object: 128,
  EdgeOfMap: 256,
} as const;

export type CollideFlag = (typeof CollideFlag)[keyof typeof CollideFlag];

export const CollideMask = {
  StaticImpassable: CollideFlag.Ledge | CollideFlag.Solid,
  NonShootable: CollideFlag.Solid,
  NonMovable: CollideFlag.Ledge | CollideFlag.Solid | CollideFlag.Creature | CollideFlag.Object | CollideFlag.Player,
  Moving: CollideFlag.Creature | CollideFlag.Player,
  NonMovablePlayer: CollideFlag.Ledge | CollideFlag.Solid | CollideFlag.Creature | CollideFlag.Object | CollideFlag.Player,
  NoSpawn: CollideFlag.Creature | CollideFlag.Object,
  Navigation: CollideFlag.Ledge | CollideFlag.Solid | CollideFlag.Object,
  MapBorder: CollideFlag.EdgeOfMap | CollideFlag.Solid,
} as const;

export const DirectionBit = {
  East: 1,
  SouthEast: 2,
  South: 4,
  SouthWest: 8,
  West: 16,
  NorthWest: 32,
  North: 64,
  NorthEast: 128,
} as const;

export const DirectionBits = {
  Diagonal: DirectionBit.SouthEast | DirectionBit.SouthWest | DirectionBit.NorthWest | DirectionBit.NorthEast,
  Straight: DirectionBit.East | DirectionBit.South | DirectionBit.West | DirectionBit.North,
  All: 255,
} as const;

export const BlockedStraightMask = {
  East: ~(DirectionBit.East | DirectionBit.NorthEast | DirectionBit.SouthEast),
  South: ~(DirectionBit.South | DirectionBit.SouthEast | DirectionBit.SouthWest),
  West: ~(DirectionBit.West | DirectionBit.SouthWest | DirectionBit.NorthWest),
  North: ~(DirectionBit.North | DirectionBit.NorthWest | DirectionBit.NorthEast),
} as const;
