# Game loop

Source: `CMain.Process`, `CMain.ProcessFrames`, `CMain.SetState`, `CMain.ProcessBGTasks`.
Port: `src/entry/FrameClock.ts`, `src/entry/GameLoop.ts`, `src/services/ScreenFlow.ts`,
`src/services/GameSession.ts`.

## Frame accounting

`FrameClock.process(now, ticksPerSecond)` is `ProcessFrames`:

```
interval = 1000 / ticksPerSecond
timeSlice ??= now
ticks = floor((now - timeSlice) / interval)
if ticks > 0: timeSlice += ticks * interval; return min(ticks, frameCap = 1)
```

The time slice advances by every elapsed interval even though at most one tick runs, so
a slow frame drops logic time instead of catching up (the game slows down, as Flash did).
`reset(now)` is `ProcessFrames_Reset`, called on every screen change (`SetState`).

`GameLoop` runs on `requestAnimationFrame`: tick the screen 0 or 1 times, present, then
give the screen up to 6 ms of idle time (`RenderStack_Process`; the original allowed
25 ms per Flash frame). The tick rate comes from the active screen: 25 for menus,
`SimulationSettings.ticksPerSecond` in a game (12.5, 25 or 50 by game speed; the world
itself uses 25 while it loads).

The next animation frame is requested before the frame's work runs. An exception from a
screen's `tick`, `present` or `idle` (or from building the next screen) is caught, so one
bad frame does not stop the loop for good. `GameLoop` reports the first failure of a run
of failing frames to `main.ts`, which logs `loop.frame_failed` with the screen name and the
stack; the next success ends the run. The page shows no error overlay, because
`Shell.showError` is final and would cover a game that recovers on the next frame.

## Screens

`ScreenFlow` owns the active `Screen` (`tick`, `present`, `idle`, `pointer`, `key`,
`cursor`, `suspend`, `dispose`). Transitions requested during a tick are applied after it,
which bumps `version` and resets the clock. The screens are the main menu, select world
(`src/ui/screens/menu/`, ticking at 50/s) and the game (`GameScreen.ts`); see
`docs/runtime/screens.md`. A new screen receives the last pointer position as a move so
its hover state and cursor are right at once. `ScreenFlow` reports cursor changes to the
shell through a callback.

## Game session

Per tick, `GameSession.tick()`:

1. samples input (with `quitRequested` from the QUIT? button and the number of ambience
   voices playing) and toggles the upgrade list on a P press,
2. calls `world.update(input)`,
3. drains the events and routes them: sounds and ambience to the mixer, decals into the
   floor plane, score popups to the HUD, `worldCompleted` to the screen flow,
4. passes the upgrade list (or none) to the HUD and renders the world frame.

`World.create` already runs the first tick (`InitCleanUp`), so the session routes its
events and renders once at start.

## Visibility

A hidden page releases all keys and suspends audio. The browser stops animation frames,
so a single-play world does not advance while hidden; when the page is visible again the
clock resets and no time is caught up. An online game sends released controls to the
server (`releaseControls`); the server world keeps running.
