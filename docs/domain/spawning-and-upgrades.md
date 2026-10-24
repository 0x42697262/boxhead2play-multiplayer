# Spawning, levels, multiplier and score

Source: `World/CWorld.as` (`Spawn_*`, `LogKill`, `_CreatePickup`, `PlayerDead`),
`World/CUpgrades.as`, `World/CHud.as`. Port: `src/domain/world/spawning.ts`,
`src/domain/world/World.ts`, `src/domain/upgrades/`, `src/domain/hud/HudState.ts`.

## Spawn points

* Zombie and devil points are validated once after init (`Spawn_ValidateAll`). A point
  needs a straight neighbour without static collision. That neighbour is stored as
  `nextCell`, and points without one are dropped.
* Player points are not validated, so their `nextCell` stays empty.

Selection always starts at `rng.int(points.length)` and wraps around:

| Function | Original | Accepts |
|---|---|---|
| `pickSpawnPoint` | `Spawn_ValidPosition` | first point where `cell \| nextCell` has no `Creature`/`Object` |
| `pickSpawnPointNonStrict` | `..._NonStrict` (devils) | first point where `cell \| nextCell` has no `Creature` |

### Player spawns (all modes)

Rooms have only one `Player1` and one `Player2` marker, which 16 players cannot share, so
players do not use the original `..._Close` / `..._Far` marker picks. `World.playerFloor`
is every cell reachable from the markers through straight neighbors without static
impassable or edge-of-map flags (`reachableFloor`), starting with the `Player1` marker.
`World.playerRespawnPoint()` (start, late join and respawn, every mode) calls
`pickPlayerSpawnCell(floor, spawnRng, clear)`:

1. Drop cells with `NonMovablePlayer` flags (walls, objects, creatures, players).
2. Of the rest, keep cells with no living player and no `Creature` cell within
   `PLAYER_SPAWN_CLEARANCE_CELLS` = 3, and no zombie or devil spawn point within
   `PLAYER_SPAWN_ENEMY_POINT_CELLS` = 5 (Chebyshev distance).
3. Pick `rng.int` of the kept cells, or of the free cells when none is kept.

The point faces the `Player1` marker's rotation. `openSpawnNear` still moves a spawn off a
taken cell. `spawnRng` (`WorldDependencies.spawnRng`) defaults to the world rng; tests pass
`SequenceRng([0])`, which picks the `Player1` marker.

Online, players can join and leave a running world:

* `World.joinPlayer(index, character)` spawns the player on `playerRespawnPoint()`, at the
  lowest free index.
* `World.leavePlayer(index)` deletes the player and corrects the live and total player
  counts.

## Level progression (`Upgrades.process`, every tick except deathmatch)

`buildLevels(25 ticks/s, devilsActive)` reproduces `InitLists` for levels 1..100:

| Level n | zombie spawn rate (ticks) | zombie quota | zombie total | speed-up |
|---|---|---|---|---|
| 1 | 25 | 10 | 10 | 1.1 |
| n | `max(26 - n, 1)` | `min(5n + 5, 60)` | `5n + 5` | `min(1 + n/10, 5)` |

Devils (only with the devils option): spawn rate `250 - (n - 1)`, minimum 25 ticks. Quota
`floor(c)` with `c = 0` at level 1, `1` at level 2, then `+0.3` per level up to 5. Total
`floor(t)`, with `t` = 0, 1, then `+0.25` per level. Levels above 100 reuse level 100 and
are announced as "(FOREVER)".

The tables and the multiplier timers computed during loading use **25 ticks/s**, because
`CMain.mFPS` is only changed to the game speed after the world has loaded. The port
reproduces this with `SimulationSettings.loadTicksPerSecond`.

Each tick:

1. If the zombie quota and devil quota are both `<= 0` and no zombie or devil thing exists
   (`ThingCollection.count`, which includes corpses until they fade), go to the next level
   and play `click` (`World.End.wav`).
2. Otherwise, while live zombies `< min(quota, 60, or 40 at low detail)`, count down the
   zombie spawn timer and spawn when it passes 0. Devils count down by 1, or by 10 when the
   zombie quota is 0.
3. The multiple-kill timer and the multiplier timer count down. When the multiplier timer
   runs out, the multiplier drops by one.

When a zombie dies, the zombie total drops by 1, and the quota is clamped to the total.
Then `logKills(1)`: multiple kill +1, multiplier +1.

## More enemies for more players (`playerScaling.ts`)

Not in the original (owner request). From the second player on, every extra player in the
match (`totalPlayerCount`, dead players waiting to respawn included) adds half of the level's
base counts on top: `zombieCount`, `zombieTotalCount`, `devilCount` and `devilTotalCount`
each grow by `floor(base * 0.5 * extraPlayers)`. Example: level 1 has 10 zombies; 2 players
get 15, 3 get 20, 4 get 25.

`Upgrades.scaleToPlayers` runs at the start of every tick. It keeps the extra counts it has
granted for the current level and adds or removes the difference, so players who join or
leave mid-level change the remaining quota at once. A new level starts again from its base.

The live caps grow the same way: zombies `min(60 * (1 + 0.5 * extraPlayers), 120)` (40
instead of 60 with low detail), devils at most 20 alive with two or more players. One player
keeps the original numbers exactly.

## Multiplier

* The multiplier stays in `1..999`. Each set restarts its timer:
  `ticks(i) = (101 - min(i, 100))^2.5 / 100000 * (3 * ticksPerSecond - 3) + 3`. That is
  75 ticks at x1 and 3 ticks at x100, at 25 ticks/s.
* The multiple-kill timer is `ticks(k) / 6`. The `mMultipleKills` table is empty in the
  original, so multiple kills only matter for pickups.
* When the multiplier rises to an index in `MULTIPLIER_UPGRADES` (58 entries, from x3
  "Pistol+: Fast Fire" to x125 "Railgun+: Long Shot"), each entry not yet active is applied
  once. Stat upgrades go into the class record, and weapon unlocks call
  `PlayerThing.newWeapon` on every player. Each shows a green upgrade message.
* Difficulty sets the start level and multiplier with messages silenced: Beginner 1/1,
  Intermediate 10/10, Expert 20/30, Nightmare 35/50. Deathmatch uses 1/200, which unlocks
  every weapon and upgrade.

## Class upgrades

`registerWeapon/registerCreature/registerObject` store the first instance's stats as the
class originals. `apply*Upgrade` recomputes from the originals whenever the class record
changed since the thing's `upgradeStamp`. Weapons call `applyWeaponUpgrade` every
`Update`, so an ammo upgrade refills the weapon. Damage x2/x4/x10, rapid fire
`round(max(rate/4, 2))` plus auto, fast fire (auto), bang levels, wide shot levels,
ammo x2/x4/infinite (999999), range x1.5 or 100. Creatures only get `SpeedUp`. Devils
register through the zombie path in the original, so their fire rate and attack speed
upgrades are never used.

## Kills, score and pickups (`World.logKill`)

| Killed | Effect |
|---|---|
| Zombie | live zombies -1 (see above). If `multipleKill % 5 == 0`, a dropped pickup. Score. |
| Devil | live devils -1, always a dropped pickup, score. |
| Player | player count -1, that player's death counter +1. In deathmatch, a dropped pickup. No score. |

Score = `thing.score * multiplier`, using the multiplier after the kill was counted. It is
added to `HudState.totalScore`. A `ScoreAwarded` event (world and screen position) is
emitted only at high detail, as the original only drew popups then. A dropped pickup is
created only if its cell is not static impassable. It disappears after 10 s
(`10 * ticksPerSecond`).

## Completion

| Mode | Rule | State |
|---|---|---|
| Single, Coop | a dead player's last second calls `playerDead()` and the player count is `<= 0` | `playerDead` |
| DeathMatch | a player's frags reach `KILLS_TO_WIN[gameAmount]` (5/10/20/50) | `playerWon`, `world.winnerIndex` |

Kill messages: every player death adds a red (`Critical`) HUD message for all players
(`killMessage`): "<KILLER> killed <VICTIM>!", "<VICTIM> killed themselves!", "<VICTIM> was
killed by a zombie!" / "a devil!", or "<VICTIM> died!". The message carries `names` (param ->
player index); the client fills in the online names. The attacker is the root of the
affect owner's `parent` chain (`rootOwner`), so grenades, rockets, mines and barrels count
for the player who fired or placed them.

Frags (`HudState.recordDeath`): a player death credits the victim's `lastAttackerIndex`
when it is another player. A death without one (own grenade or barrel, a zombie or devil,
an unknown killer) still counts as a death but gives nobody a frag.
| any | QUIT? on the upgrade list | `quit` |

`World.update` emits `WorldCompleted` at the end of the tick in which the state was set,
and does nothing afterwards (the original `CMain` stopped calling the world).
