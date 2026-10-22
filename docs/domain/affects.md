# Affects

Source: `Thing/Affect/*.as`, `World/Map/CMap_Affect.as`, `CMap_Cell.Affect`, and the
consumers `CThing_Creature.ProcessAffects`, `CThing_Object_Wall.ProcessAffects`. Port:
`src/domain/things/affects/`, `src/domain/map/MapAffect.ts`.

An affect is a message "something hit you". It is queued on the target
(`thing.affect(a)` pushes onto `thing.affectors`). The target consumes its queue at the
start of its next `process()`.

## Delivery

A thing accepts an affect when `thing.affectFlags & affect.type` is non-zero and
`affect.affector.id !== thing.id`. Shots inherit their parent's id
(`Thing.id = parent.id`), so a player's bullets never hit the player.

| Delivery | Used by |
|---|---|
| `thing.affect(a)` directly | Bullets after `collideLine` hits a thing |
| `MapCell.affect(a)` (every accepting thing in one cell) | Zombie attack on the cell in front, devil attack on an object |
| `MapAffect.affectArea(rect, a)` | Explosions (`rect` = position ± range), devil fireballs on impact |
| `MapAffect.affectLine(owner, p1, p2, r, a)` | Railgun, laser, D-laser: every accepting thing on the line, no wall stop |

## Types (`AffectType`)

Bit flags: Bullet 1, Electrocuted 2, Explosion 4, Punched 8, Push 16, Vaporize 32,
ZombieAttack 64, PlayerLineOfSight 128, DevilAttack 256, FireBall 512.
`PlayerLineOfSight` is never delivered. Players and devils set it so that devil
line-of-fire tests can hit them.

## Damage (`affectThing`)

All types subtract `damage` from `target.life` and return it, except explosions:
`ExplosionAffect` uses the 2D distance from the explosion (the affector) to the target.
At most 50 % of the range it does full damage, at most 75 % it does 75 %, at most 100 % it
does 50 %, and beyond the range nothing.

## Creature reaction (`hitReaction.ts`)

`resolveHit(affect, target, damageActive)` reproduces the `switch` in
`CThing_Creature.ProcessAffects` as a pure function. The creature engineer applies the
result (state, `delta`, facing).

| Type | Applies when | stateCount | knockback length |
|---|---|---|---|
| Bullet | not (player and damage off) | `round(d / 5 * 2)` | `max(d / 5 * 2 / 32, 0.3) / mass` |
| FireBall | always (even players with damage off) | same as bullet | same as bullet |
| Explosion | not (player and damage off) | unchanged | `min(d / 5 * 2 / 32 / mass, 0.3)` |
| ZombieAttack | always | `round(d / 5)` | `max(d / 5 / 32 / mass, 0.3)` |
| others | never | | |

The knockback points away from the affector. The 3D difference is normalized, then `z` is
zeroed. The creature faces the affector (`atan2(delta) + PI`). Invincible creatures skip
the whole queue. The original iterates the queue with `for..in` (newest first), and each
reaction overrides the previous state, so the **oldest** affect decides the final state.
`affectorsInProcessingOrder` returns that order.
