# Objects and effects

Source: `Thing/Object/*.as`, `Thing/Effect/*.as`. Port: `src/domain/things/objects/`,
`src/domain/things/effects/`, visuals in `src/domain/things/clipVisual.ts`.

## Objects

| Object | Behavior |
|---|---|
| `Barrel` | Unique id, at its cell centre, damage 100 (150 from the weapon). On init: accepts bullets, explosions, devil attacks and fireballs, marks the cell `Object`, registers for upgrades. If a player stands on the cell it waits, then grows its radius by 0.05 per tick to 0.42. The first accepted affect applies the object upgrades, deletes the barrel and adds an `Explosion` at its position with its parent (the placing player). Disposal clears `Object`. |
| `Wall` | Unique id, life 1000, accepts bullets, explosions, zombie attacks, devil attacks and fireballs from construction. Same placement as the barrel but grows to 0.48, otherwise radius 0.42. An affect wakes it up. Damage shows frame `floor((1 - life / 1000) * frameCount)` of `Object.Wall`. At 0 life: `SmokeCloud`, scorch mark, alpha -20 per tick, deleted below 10. |
| `Mine` | At the cell centre, drawn on the floor (`SortFloor`). Triggers on `Creature` (and `Player` in deathmatch, where it first waits for the cell to clear). Trigger: detonate sound, explosion after 2 s. |
| `ChargePack` | Like the mine, but triggered by its weapon (`detonateRequested`), explodes 0.1 s later. |
| `Pickup` | Snaps to the cell centre. When a live player's flag is on the cell: `randomPickup`, pickup sound, then hidden for 30 s (10 s in deathmatch). Dropped pickups (`Pickup.dropped`) live 10 s, fade during the last second and are deleted when taken. |
| `WallMovable`, `LaserNode` | Empty in the original. |

## Effects

| Effect | Visual | Behavior |
|---|---|---|
| `Explosion` | `Effect.Explosion` animation at 2.5 frames per tick | Unique id, range `2 + max(damage - 100, 0) * 0.005`. Init: cluster shells (4, at 90° ± 22.5° random) and bigger-bang fragments (`2π / (bang * 1.5)` apart, delay 2..5 ticks). After its delay: shake `(0, 30)`, brightness flash, `ExplosionAffect` on the square area, scorch mark, explosion sound. |
| `BulletHit` | `Effect.BulletHit` | plays once |
| `SmokeCloud` | `Effect.SmokeCloud` | plays once |
| `RocketSmoke` | `Effect.RocketSmoke` | drifts backwards, 1.2 times faster each tick, plays once |
| `MuzzleFlash` | `<Weapon>.MuzzleFlash`, omni-directional with 8 angles | drawn for the tick after it was fired |
| `SmartBombEffect` | none | deletes itself |
| `FireBallHeld` | `Effect.FireBall` | never placed in the mapwho, so never drawn (unused) |
| `BloodPool`, `BloodSplat` | none | empty in the original (blood splats are decals) |

Clip frame counts come from `AnimationCatalog.clips[symbol]` (1 frame when missing).
`ClipAnimator` reproduces `Animate` (stops past the last frame), `Animate_Cycle`,
`Animate_Random` and `GotoToFrame`.
