export const UpgradeProp = {
  FastFire: 'FastFire',
  RapidFire: 'RapidFire',
  DoubleDamage: 'DoubleDamage',
  QuadDamage: 'QuadDamage',
  FatalDamage: 'FatalDamage',
  DoubleAmmo: 'DoubleAmmo',
  QuadAmmo: 'QuadAmmo',
  InfinateAmmo: 'InfinateAmmo',
  LongShot: 'LongShot',
  InfinateRange: 'InfinateRange',
  WideShot: 'WideShot',
  WiderShot: 'WiderShot',
  BigBang: 'BigBang',
  BiggerBang: 'BiggerBang',
  ClusterExplode: 'ClusterExplode',
  HomingMissiles: 'HomingMissiles',
  SpeedUp: 'SpeedUp',
  FireRateUp: 'FireRateUp',
  AttackSpeedUp: 'AttackSpeedUp',
} as const;

export type UpgradeProp = (typeof UpgradeProp)[keyof typeof UpgradeProp];
