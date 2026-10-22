import { HitState } from '../affects/hitReaction.ts';

export const CreatureState = {
  None: 'none',
  EnterMap: 'enterMap',
  CellToCell: 'cellToCell',
  Turn: 'turn',
  TurnAndMove: 'turnAndMove',
  Stand: 'stand',
  Sleep: 'sleep',
  Wait: 'wait',
  WaitToMove: 'waitToMove',
  BulletHit: HitState.BulletHit,
  ExplosionHit: HitState.ExplosionHit,
  ZombieHit: HitState.ZombieHit,
  Dying: 'dying',
  Dead: 'dead',
  GotoPlayer: 'gotoPlayer',
  Attack: 'attack',
  RemoveObject: 'removeObject',
  PlayerControl: 'playerControl',
  Respawn: 'respawn',
} as const;

export type CreatureState = (typeof CreatureState)[keyof typeof CreatureState];
