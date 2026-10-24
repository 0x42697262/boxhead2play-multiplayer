# ADR 0001: A pure, mutable domain that emits events and exposes visual descriptors

Status: accepted

## Context

In the original, simulation and presentation are mixed. `CWorld` is a `MovieClip`. Things
call `CSound.mSamples.X.PlaySound()` directly. Decals are stamped into floor bitmaps from
inside creature states (`CMap_Decal.Draw_BloodSplat`). Score popups are rasterized in
`CHud.AddScore`. The camera, the screen shake and the zombie ambience run inside
`CWorld.Draw`. Static globals (`CMain.mFPS`, `CThing_Position.mPFactor`,
`CMain.mSaveData`, `_root._quality`) are read everywhere, and randomness comes from
`random(n)` and `Math.random()`.

The port has to keep the original numbers and algorithms. It also has to be unit-testable
without a browser, and it must not depend on how or when the screen is drawn.

Options:

1. **Immutable state with reducers.** Each tick returns a new world. This is clean, but the
   original is about 100 mutable classes with cross references (cells hold things, things
   hold cells, affects hold things). A rewrite to reducers would hide the original
   algorithms that we are supposed to keep.
2. **Mutable entities with injected ports.** Things call `audio.play()` and
   `renderer.stamp()` through interfaces. This is testable with mocks, but the domain then
   decides *when* side effects happen relative to rendering, and every test needs mocks.
3. **Mutable entities, side effects as events, visuals as plain data.**

## Decision

Option 3.

* `src/domain/**` holds mutable objects (`World`, `GameMap`, `MapCell`, `Thing`
  subclasses) that mirror the original classes one to one. State transitions stay local and
  in the original order.
* The domain does no I/O. Clock, randomness, settings and asset metadata are explicit
  inputs: `Rng`, `SimulationSettings` (includes `ticksPerSecond`), `AnimationCatalog`,
  `RoomDefinition`, `TickInput`.
* Every side effect the original performed inline becomes a `DomainEvent`
  (`src/domain/events.ts`) written to an `EventSink`. The `World` owns an `EventQueue`.
  `GameSession` drains it after each tick and routes events to audio, renderer and HUD
  adapters.
* Things expose `visual(): Visual | undefined`, a plain data descriptor
  (`src/domain/visuals.ts`). The world exposes `presentation` (cameras, and shake and brightness per camera)
  and `drawList(camera)` in the original draw order. The render adapter only reads.
* Presentation state that affects gameplay stays in the domain. The camera position is
  used for score popup positions, and the visible zombie count drives the ambience. The
  `World` computes both in `present()` at the end of each tick, which is where
  `CWorld.Draw` ran in the original (one draw per logic tick, `mFrameCap = 1`).

## Consequences

* Domain tests are plain unit tests: build a `World` from a `RoomDefinition`, plug in fake
  things through `ThingFactory`, use `SequenceRng`, assert on state and drained events.
* The domain cannot know whether a sound is still playing. Where the original read that
  (`mZombieSamples[i].mPlaying` in `ProcessAmbience`), the service passes it back in as
  input (`TickInput.ambienceSamplesPlaying`).
* Adapters must not cache domain objects across ticks. They should read descriptors each
  frame.
* Event ordering is part of behavior. Events are emitted in the same order as the original
  side effects (for example `LogKill` emits the score popup after any pickup is created).
