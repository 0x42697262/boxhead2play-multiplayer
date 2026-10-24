# Weapons and shots

Source: `Thing/Weapon/*.as`, `Thing/Shot/*.as`. Port: `src/domain/things/weapons/`,
`src/domain/things/shots/`.

## Weapons

A weapon is a `Thing` owned by a player (`WeaponHolder`). Its position is the player's
position object, its id is the player's id, and it is never added to the thing collection
(`Register_Thing`). Construction registers it with `Upgrades.registerWeapon`. The player's
`WeaponInventory` keeps one slot per `PLAYER_WEAPON_ORDER` entry. `newWeapon` activates a
slot and builds a fresh weapon (full ammo, current upgrades). `createWeapon(id, holder)`
replaces `CThing_Weapon.byCLASSID`.

`update(fire)` (once per `playerControl` tick):

1. `Upgrades.applyWeaponUpgrade` (an ammo upgrade refills).
2. Empty: red message `hud.outOfAmmo.<id>` for the holder's player index only (online, the
   other players do not see it), select the pistol, stop.
3. `--fireRateCount <= 0`: auto weapons fire while the key is down, on-release weapons on a
   release, the others on a press. Firing takes the gun position (`GunPosition_Right`
   anchor of the current frame, or the player position) and a copy of the facing.
4. `decrementAmmo` sets `fireRateCount = fireRate` and takes one round unless the ammo is
   infinite (999999).

| Weapon | Key | Fire rate | Ammo | Damage | Mode | Fires |
|---|---|---|---|---|---|---|
| Pistol | 1 | 8 | infinite | 26 | press | muzzle flash, `Bullet` range 8 |
| UZI | 2 | 4 | 100 | 35 | auto | muzzle flash, `Bullet` range 8 |
| Shotgun | 3 | 12 | 20 | 51 | press | flash, 1 + 2 bullets at ±1.25°, wide shot ±2.5° and ±5° with the outer pair one tick late, range 7 |
| Barrels | 4 | 1 | 10 | 150 | press | `Barrel` if the gun cell holds at most one thing |
| Grenades | 5 | 12 | 20 | 150 | release | `GrenadeShot`, power = hold seconds clamped to 0.25..0.75 |
| Fake Walls | 6 | 1 | 5 | | press | `Wall` (same cell rule) |
| Claymore | 7 | 1 | 10 | 100 | press | `Mine` (same cell rule) |
| Rocket Launcher | 8 | 12 | 20 | 250 | press | `RocketShot` |
| Charge Packs | 9 | 1 | 10 | 150 | press | place a `ChargePack`, the next shot detonates every pack of this player |
| Railgun | 0 | 5 | 15 | 100 | press | flash, `RailgunShot` range 10 |
| The Devastator | | 4 | infinite | 100 | auto | `DevastatorShot` (not in the player list) |
| Smart Bomb | | 12 | 20 | 100 | press | `SmartBombEffect` (not in the player list) |

Rockets, grenades, barrels, mines and charge packs pass the weapon's `biggerBang` and
`clusterExplode` upgrades to their explosion. A charge pack weapon is only empty when it has
no ammo and no packs placed. Its `reset` arms detonation when packs remain and the ammo is
spent. Both checks run every tick, so they use `ThingCollection.some` and stop at the first
pack without copying the thing list; only detonation collects the packs (newest first).

Pickups call `randomPickup`: every active weapon except the pistol gets weight
`(1 - ammo / totalAmmo) * 0.75 + 0.25`, life gets `(1 - life / maxLife) * sum` when hurt,
and `rng.next() * total` picks one. A weapon pick rebuilds the weapon (full ammo).

## Shots

| Shot | Behavior |
|---|---|
| `Bullet` | Destination = start + range along the facing. Jitter `delta = (0, (2..5)/32, (2..5)/32)` rotated. First processed tick: `collideLine` radius 0.04 with `Bullet`, stop at the hit, `BulletAffect` on a thing, one in three hits shows `BulletHit` at high detail, a random wall-hit sound. Then 2 ticks of drift (`delta * 0.75` each tick). Drawn as a 0.5 px `0xCCCCCC` line at alpha 75. Delayed bullets wait one tick first. |
| `RailgunShot` | Like a bullet, but the line only stops at walls and `affectLine` hits every thing on it. 2 px `0x9966FF` line. |
| `DLaser`, `Laser` | Piercing like the railgun. Unused by the game. The laser never deletes itself. |
| `RocketShot` | Starts at 0.5 cells per tick, accelerates x1.1, leaves `RocketSmoke` on half the ticks, explodes into its prepared `Explosion` when the next step's line (radius 0.04) hits anything. The explosion shares the rocket's position. |
| `HomingMissile` | Same flight, makes a new explosion. Unused (no homing logic in the original). |
| `GrenadeShot` | Starts at 1.25 cells high, `delta = facing * power`, `z` speed 0.5 * power, gravity 0.06, floor bounce x0.5, wall bounce (`bounceCollide`) x0.25 in 2D, bounce sound above 0.06, explodes after 60 ticks. |
| `ClusterShell` | Thrown by cluster explosions: lives 16..23 ticks, speed 0.05..0.1, the grenade bounce, then its own `Explosion`. |
| `DevastatorShot` | 0.9 cells per tick, stops at walls only. From its fifth tick, every other tick, two lines of up to 8 explosions (damage 200) at 0.4 + 0.8 k cells to both sides, stopping at static cells. |
| `FireBall` | Devil projectile: speed 0.15 x1.02 per tick, `genericCollide` against collidable things and walls, then an area affect (`FireBallAffect` with the devil's damage, or `DevilAttackAffect` 10000 for object attacks, radius 1). |

Shots inherit the owner's id, so a player's shots never hit that player.
