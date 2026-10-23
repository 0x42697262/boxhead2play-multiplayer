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
| `pickSpawnPointClose` | `..._Close` (coop respawn) | smallest squared 3D distance `>= 4` |
| `pickSpawnPointFar` | `..._Far` (single, deathmatch) | largest squared distance (`>=`, so later ties win) |

Close and Far skip cells with `Creature`, `Object` or `Player`, and only accept points
within the player scope (`|dx| <= 19`, `|dy| <= 13` cells, about one screen).

Player 1 starts on the `Player1` marker, or on `pickSpawnPoint` when there is none. One
player spawns per entry in `settings.playerCharacters` (up to `MAX_PLAYERS` = 4); players
2..4 spawn with Close/Far relative to the players already placed. If the chosen cell holds
a player or a `Player` collide flag, `openSpawnNear` searches up to 64 cells breadth first
(straight neighbors, skipping static impassable cells) for an open one. Respawns use
`World.playerRespawnPoint(nearestOtherPlayer)`: the nearest living other player (2D
distance), or any other player when all are dead.

Online, players can join and leave a running world:

* `World.joinPlayer(index, character)` spawns the player near the first living player
  (or on a random player point), at the lowest free index.
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

Frags (`HudState.recordDeath`): a player death credits the victim's `lastAttackerIndex`
when it is another player. Otherwise (suicide by barrel, own grenade, an unknown killer)
it credits every opponent, which for two players is the original rule (a death counts as
the other player's kill).
| any | quit from the pause screen | `quit` |

`World.update` emits `WorldCompleted` at the end of the tick in which the state was set,
and does nothing afterwards (the original `CMain` stopped calling the world).
