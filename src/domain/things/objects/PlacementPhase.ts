export const PlacementPhase = {
  Init: 'init',
  PlayerOnCell: 'playerOnCell',
  GrowRadius: 'growRadius',
  NormalInit: 'normalInit',
  Normal: 'normal',
  Sleep: 'sleep',
  FadeOut: 'fadeOut',
} as const;

export type PlacementPhase = (typeof PlacementPhase)[keyof typeof PlacementPhase];
