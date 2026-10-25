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
   * `present()` (the logic half of `CWorld.Draw`): drop the screen effects of players
     that are gone, decay each camera's shake, compute the cameras, decay each camera's
     brightness, prune HUD messages, count visible zombies, step the ambience.
     The last two run only when `settings.presentAmbience` is on. The online server builds
     its settings with `SERVER_SIMULATION_HOST`, which turns them off: it would only throw
     the ambience events away, because clients step the ambience from their own frames.
4. Emit `worldCompleted` when the state was set during this tick.

The service calls `update` at `settings.ticksPerSecond` with at most one tick per rendered
frame (`CMain.mFrameCap = 1`), and renders `presentation` and `drawList(camera)` after it.

## Camera (`camera.ts`)

* One 640 x 480 camera per player, in player index order (`World.cameraFor(index)`).
  Players call `world.trackPlayer(this)` each tick while alive.
* Single and coop: the camera follows its player at 0.16 cells per tick, multiplied by
  `(distance - 0.16) / 5 + 1` when further behind. The original coop camera followed the running average of both players
  (`(previous + p) / 2`); that is removed with the shared screen.
* Deathmatch: each camera is locked to its living player.
* Dead player, every mode (`World.freeCamera`, `panFreeCamera`): the camera is free. It
  starts where it was, and the player's own movement controls (W A S D, the touch stick)
  pan it at 0.4 cells per tick (`FREE_CAMERA_SPEED_CELLS`, same speed diagonally), with no
  smoothing. The point is clamped to where the view rectangle can go, so pushing against a
  room edge never builds up a dead stretch. The inputs still reach the world while the
  player is dead (locally from the keyboard, online from `RemoteControls`), so online play
  needs no protocol change: the server's camera for that player moves. On respawn the
  player tracks again; coop then pans back from the free point (smooth follow), deathmatch
  snaps to the player.
* The view rectangle is centred on the projected target and clamped with `CMath.Range` to
  `[32, roomSize - (view + 32)]`. If the room is smaller than the view, `Range` returns the
  max bound.
* `drawOrigin = rect + shake`, with the shake of that camera. Local score popups use the first camera's origin; online,
  the server recomputes the popup position per player camera.

## Shake and brightness

Each camera (player index) has its own `ScreenEffects` (`CameraEffects.ts`). The original
had one world-wide shake and brightness for its one shared screen; with up to 16 cameras
an explosion would otherwise shake and flash every player's view.

* `shake(source, dx, dy)` and `flashBrightness(source, level)` take the world position of
  the source. They project it with `cellToScreen` and apply only to cameras whose view
  rectangle from the previous `present()` (the one on screen while things process)
  contains that point, widened by `SCREEN_EFFECT_SOURCE_MARGIN_PX` (112 px, 3.5 cells) on
  every side. The margin covers an explosion centered just off screen whose clip still
  shows: `Effect.Explosion` draws a 192 x 96 px fireball sprite (`-96..96`, `-96..0`
  around the explosion) at up to 1.128 scale, so it reaches about 108 px from its center;
  that rounds up to 3.5 cells. It is also wider than the 2-cell (64 px) blast radius of a
  normal explosion, so a player hurt by a blast at the edge of the view feels it.
* The domain events `cameraShaken` and `brightnessFlashed` are still emitted once per
  call, whether or not a camera sees the source.
* Players placed when the world is created start with brightness 1 (the original start
  flash). A late joiner (`joinPlayer`) starts with no shake and brightness 0. A leaving
  player's effects are removed in `leavePlayer`, and `present()` drops the effects of any
  index that no longer has a player.
* `presentation.effects` maps each camera's player index to `{ shake, brightness }`;
  `effectsFor(index)` returns no shake and brightness 0 for an index without a camera.
  Online frames send `effectsFor(playerIndex).brightness`; local play uses player 0.

* `shake` adds to the camera's offset if its length is below 32 px. Each tick the offset
  becomes `-0.5 *` itself and snaps to 0 below 0.1 px. Explosions shake `(0, 30)`, so the
  first drawn offset is `(0, -15)`.
* `flashBrightness(1)` (explosions). A camera of a player placed at world creation starts at 1. At high detail, each tick
  subtracts 0.2 toward 0 (snapping below 0.2), and the camera's `brightness` is the value
  to add (times 255) to RGB.

## Processing order

AS2 `for..in` over an object visits properties newest first. The original stored things
in objects keyed by `"t" + id`, so the port processes things in reverse insertion order.
For the same reason, it lists cell occupants newest first and walks area cell lists in
reverse. Things added during a pass are not processed in that pass, because AVM1 collects
the keys before the loop starts.
