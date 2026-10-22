# Architecture

This is a JavaScript (TypeScript) port of *Boxhead: 2Play Rooms* (Sean Cooper, 2007,
Flash 8 / ActionScript 2). The original SWF is decompiled into `re/` (gitignored); its
behavior is the specification. Game assets are extracted from the SWF by
`tools/extract` into `public/assets/` (generated, gitignored).

## Layers

The general rule is: entry -> service -> pure domain -> adapters. In the game, that maps to:

| Layer | Folder | Job | Must not |
|---|---|---|---|
| Entry | `src/entry/` | Browser event listeners (keyboard, visibility, resize) and the fixed-step game loop. Translate raw input into commands, call one service method. | Contain game rules. |
| Services | `src/services/` | Use cases: run a game session (`GameSession`), drive the screen flow (`ScreenFlow`), load/save settings (`SettingsService`). Own the tick, drain domain events and route them to adapters. | Touch the DOM, canvas or WebAudio directly. |
| Domain | `src/domain/` | The simulation: map, collision, navigation, creatures, weapons, shots, effects, spawning, upgrades, scoring, game modes. Deterministic given (inputs, Rng, settings). | Do I/O, read the clock, call `Math.random`, read env, import adapters/services/ui. |
| Adapters | `src/adapters/` | Canvas rendering, WebAudio, keyboard state, `localStorage`, asset fetching and validation. | Make game decisions. |
| UI | `src/ui/` | Menu screens and HUD presentation. | Be the authority on game state. |
| Config | `src/config/` | Env vars, validated with Zod once at boot (`loadSettings`). | Be read ad hoc anywhere else. |
| Text | `src/text/` | `locales/en.json` (every user-facing string), `logEvents.ts`, `errors.ts`. | Be inlined in logic. |

`src/main.ts` is the only composition root: it builds settings, logger, adapters and services, then starts the loop.

## Simulation model

* The original game runs its logic at 25 ticks per second (`CMain.mFPS`), scaled by the
  "game speed" option, with at most one logic tick per rendered frame. The port keeps that
  fixed-step model: the domain only knows ticks. The loop in `src/entry/` decides when to tick.
* Domain entities ("things") are mutable objects in a `World`, as in the original. This is a
  deliberate choice for a game simulation: state transitions are local and fast. "Pure" here
  means no I/O, no hidden globals and no wall clock. Every random draw goes through the
  injected `Rng` (`src/domain/math/Rng.ts`), and every tunable number lives in a `tuning.ts`
  module next to the code that uses it.
* Side effects the original performed inline (playing sounds, drawing blood decals into
  bitmaps, screen shake, score popups, brightness flashes) are emitted as **domain events**.
  The `GameSession` service drains them after each tick and routes them to the audio and
  render adapters.
* Rendering never mutates the domain. Each thing exposes a plain-data **visual descriptor**
  (which symbol/character animation, frame, angle, alpha, and so on), and the render adapter
  turns descriptors into canvas draws.
* Static global state in the original (`CMain.mFPS`, `CThing_Position.mPFactor`,
  `CSaveData` reads, `_root._quality`) becomes explicit inputs: a `SimulationSettings` object
  passed to the `World`, plus data derived from the asset catalogs.

## Coordinates

* World positions are in **cells** (`CMap_Cell.mCellSize` = 32 px). `x` grows right, `y`
  grows down, and `z` is height (used for shots and explosions).
* Screen projection: `screenX = round(x * 32)`, `screenY = round((y + z * pFactor) * 32)`,
  where `pFactor = -sin(tilt)` comes from the character data (`mXSIInfo.mTilt`).

## Assets

`npm run extract` runs JPEXS FFDec (path from `FFDEC_JAR`) on the SWF and writes
versioned JSON catalogs plus SVG/MP3 files under `public/assets/`. See
`docs/assets/pipeline.md`. Runtime loaders validate every catalog with Zod at the boundary
(`src/adapters/assets/`).

## Persistence

Only user settings persist (the original `SharedObject` "morerooms_default"). They are stored in
`localStorage` as a versioned JSON blob. Readers migrate older versions on read. See
`docs/persistence/settings.md`.
