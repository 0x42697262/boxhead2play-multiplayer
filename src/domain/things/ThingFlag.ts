export const ThingFlag = {
  Collidable: 1,
  WaitForMove: 2,
  CellMoved: 4,
  Drawn: 8,
  SortFloor: 16,
  Dead: 32,
} as const;

export type ThingFlag = (typeof ThingFlag)[keyof typeof ThingFlag];
