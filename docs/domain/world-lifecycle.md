# World lifecycle and tick model

Source: `CMain.as`, `World/CWorld.as`, `CSaveData.as`. Port: `src/domain/world/`.

## Settings

`createSimulationSettings(options)` freezes a `SimulationSettings`:

| Field | Original |
|---|---|
| `gameMode` | `CWorld.mGameMode` (`Single`, `Coop`, `DeathMatch`) |
| `difficulty` 0..3 | `CSaveData.mDifficulty` |
| `gameSpeed` 0..2 | `mGameSpeed`. `ticksPerSecond = 25 * (speed == 0 ? 0.5 : speed)` (`CMain.State_InitWorld`) |
| `loadTicksPerSecond` | always 25: `CMain.mFPS` while the world loads |
| `devilsActive`, `collisionsActive` | save data |
| `damageActive` | `CThing_Creature.mDamageActive`: save data, forced on in deathmatch |
| `gameAmount` 0..3 | deathmatch kills to win 5/10/20/50 |
| `playerCharacters` | `mPlayer1/2_CharacterIndex` (0 SWAT, 1 Bond, 2 GI Joe, 3 Bambo) |
| `detail` | `_root._quality != "LOW"` (zombie cap 60/40, score popups, brightness filter, bullet hit effects) |

## Construction (`new World` = `Init` + `InitThings`)

Map, HUD and upgrades (level 1, multiplier 1, silently) are created, the thing ids restart
at 1, and the room is built (`docs/domain/map-and-collision.md`). Spawn points are
validated and players are spawned.

## `start()` (`InitCleanUp`)

One full tick runs, which calls every thing's first `process()`. Then
`upgrades.setDifficulty(difficulty)` runs. In deathmatch every player gets
`resetWeapons()`. Only then does `ticksPerSecond` switch from 25 to the game speed.
`World.create()` does both steps.

## `update(input)` (one logic tick)

1. After completion: nothing.
2. `quitRequested` completes with `quit`.
3. Every tick (the world has no pause; see `docs/porting/deviations.md`):
   * `things.process()`: flush deferred deletes (dispose, remove), process every thing
     **newest first**, then update the navigation flow field.
   * `upgrades.process()`, `tick++`.
   * `present()` (the logic half of `CWorld.Draw`): decay the shake, compute the cameras,
     decay the brightness, prune HUD messages, count visible zombies, step the ambience.
4. Emit `worldCompleted` when the state was set during this tick.

The service calls `update` at `settings.ticksPerSecond` with at most one tick per rendered
frame (`CMain.mFrameCap = 1`), and renders `presentation` and `drawList(camera)` after it.

## Camera (`camera.ts`)

* One 640 x 480 camera per player, in player index order (`World.cameraFor(index)`).
  Players call `world.trackPlayer(this)` each tick while alive.
* Single and coop: the camera follows its player at 0.16 cells per tick, multiplied by
  `(distance - 0.16) / 5 + 1` when further behind. With no target (a dead player) it stays
  put. The original coop camera followed the running average of both players
  (`(previous + p) / 2`); that is removed with the shared screen.
* Deathmatch: each camera is locked to its player, also while the player is dead.
* The view rectangle is centred on the projected target and clamped with `CMath.Range` to
  `[32, roomSize - (view + 32)]`. If the room is smaller than the view, `Range` returns the
  max bound.
* `drawOrigin = rect + shake`. Local score popups use the first camera's origin; online,
  the server recomputes the popup position per player camera.

## Shake and brightness

* `shake(dx, dy)` adds to the offset if its length is below 32 px. Each tick the offset
  becomes `-0.5 *` itself and snaps to 0 below 0.1 px. Explosions shake `(0, 30)`, so the
  first drawn offset is `(0, -15)`.
* `flashBrightness(1)` (explosions). The world starts at 1. At high detail, each tick
  subtracts 0.2 toward 0 (snapping below 0.2), and `presentation.brightness` is the value
  to add (times 255) to RGB.

## Processing order

AS2 `for..in` over an object visits properties newest first. The original stored things
in objects keyed by `"t" + id`, so the port processes things in reverse insertion order.
For the same reason, it lists cell occupants newest first and walks area cell lists in
reverse. Things added during a pass are not processed in that pass, because AVM1 collects
the keys before the loop starts.
