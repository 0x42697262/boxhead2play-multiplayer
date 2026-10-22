# Domain events and visual descriptors

Port: `src/domain/events.ts`, `src/domain/sounds.ts`, `src/domain/visuals.ts`,
`src/domain/animation/`. Decision record: `docs/adr/0001-pure-domain-with-events.md`.

## Events

`World.events` is an `EventQueue`. The service calls `drain()` after every `update()`.
Events keep the order in which the original performed the side effects.

| Event | Emitted by | Original |
|---|---|---|
| `soundRequested { sound, position? }` | `Thing.playSound`, level-up click | `CSound.mSamples.X.PlaySound()` |
| `ambienceRequested { sound, maxChannels }`, `ambienceStopped` | `World.present` via `stepAmbience` | `CWorld.ProcessAmbience` |
| `decalRequested { decal, symbol, xPx, yPx, frame, rotationIndex, rotationCount, scaleX, scaleY }` | `MapDecals.bloodSplat/scorchMark` | `CMap_Decal.Draw_*` stamping into `bmFloor` through `bmDecalMask` |
| `cameraShaken { dx, dy }` | `World.shake` | `CWorld.Shake` |
| `brightnessFlashed { brightness }` | `World.flashBrightness` | `mWorld.mBrightness = 1` |
| `scoreAwarded { points, worldPosition, screenPosition }` | `World.logKill` (high detail only) | `CHud.AddScore` popup |
| `hudMessage { tone, text, playerIndex? }` | `HudState.addMessage` | `CHud.AddMessage_*` |
| `pauseChanged { paused }` | `World.update` | `CHud.Pause` |
| `worldCompleted { state }` | `World.update` | `mCompleteState` read by `CMain.State_RunWorld` |

Notes:

* **Sounds.** `SoundId` lists every `mSamples`/`mAmbience` key from `CSound.as`. `SOUND_SAMPLES` gives
  the linkage, volume factor and playback kind. `CThing.PlaySound` passed `(0, 0)` to
  `PlaySound_Positional`, so in the original every "positional" sound played centered at
  full volume. The event still carries the world position. The audio adapter should
  ignore it to sound like the original.
* **Decals.** Blood splats and scorch marks are `Effect.BloodSplat` / `Effect.ScorchMark`
  clips, pre-rendered in 3 rotations (0, 120, 240 degrees) and scaled `(1, 0.6)`. The domain
  draws the random frame (`rng.int(frameCount)` from `AnimationCatalog.clips`), the jitter
  (blood only: `± 0.25` cells on x and y) and the rotation index (`rng.int(3)`), in the
  original order. The renderer stamps the clip at `(xPx, yPx)` in room pixels into the floor,
  masked by the room's decal mask (walls are excluded). The `tAmount` argument of
  `Draw_BloodSplat` did nothing in the original.
* **Text.** Messages carry a `TextRef` (`key` in `src/text/locales/en.json` plus params),
  never a literal string.
* **Ambience.** See `src/domain/world/ambience.ts`. The visible zombie count (zombies in the
  draw lists of all cameras) chooses 1/1/2/3/3 channels and a trigger period of
  150/150/150/60/1 ticks (thresholds 1, 2, 4, 8, more). On a trigger, if fewer samples are
  playing than channels, the next of 4 sample slots is used. The original looked up
  `Creature_Zombie_Ambience_<slot>_wav` with slots 0..3, but the keys are 1..4. So slot 0 is
  silent and sample 4 never plays. The port keeps that. The service reports the number of
  ambience samples still playing in `TickInput.ambienceSamplesPlaying`.

## Visual descriptors

`Thing.visual()` returns plain data. The renderer turns it into canvas calls.
`World.drawList(camera)` returns `DrawEntry { thingKey, sortFloor, position, visual }`
in the original draw order (`docs/domain/map-and-collision.md`).

| Kind | Original primitive | Fields |
|---|---|---|
| `character` | `CDrawPrimitive_XSI_Animation.Render` | `style` (`swat/bond/giJoe/bambo/zombie/devil`), `animation` (XSI set id such as `Zombie_Zombie_Walk`), `direction` of `directionCount`, `frame` and `sourceFrame` (after `frameSequence`), `alpha` 0..100, `position` in cells |
| `clip` | `CDrawPrimitive_MovieClip_{Static,Animation,Directional,OmniDirectional}` | `mode`, `symbol` (linkage, for example `Object.Pickup`), `frame`, `rotationIndex`/`rotationCount` (directional), `angleRadians` (omni-directional, which picks one of N pre-rendered angles through the 256-step lookup), `scale`, `alpha`, `position` |
| `line` | `CDrawPrimitive_Line` into `mcScratch` (bullets, railgun, lasers) | `from`, `to` (cells, projected like positions), `thickness`, `color`, `alpha`; drawn on the overlay layer after all things |
| `square` | `CDrawPrimitive_Square` (debug) | `topLeftPx`, `sizePx`, `color`, `alpha`, `solid` |
| `group` | several primitives from one thing | `items` |

Projection: `screen = (round(x * 32), round((y + z * pFactor) * 32)) - drawOrigin`, where
`pFactor = -sin(tilt)` from the character data (`World.projectionFactor`, from
`AnimationCatalog`). `drawOrigin` is in `World.presentation.cameras[i]`.

Rendering order per camera, from `CWorld.Draw_PlayerPlane`: floor bitmap (with decals),
then `drawList` entries, then overlay lines, then the room cover bitmap. After that comes
the brightness filter (`presentation.brightness * 255` added to RGB) and the HUD.

## Animation metadata (`AnimationCatalog`)

The domain needs frame counts and model anchor points, not pixels.

* `characters[setId]`: `directionCount`, `frameCount` (sequence length), `frameSequence?`,
  `tiltDegrees`, `modelPoints[direction][sourceFrame] = { handRight?, handLeft?, gunPositionRight? }`
  (raw XSI `vPosition`). Fill it from `characters/anim-meta.json` (`Hand_Right` →
  `handRight`, ...). `modelScale` is the anim-meta `globalScale` (0.35).
* `clips[linkage].frameCount`: from `library/symbols.json` sprite `frameCount` (or the
  `_Contents` child's frame count when present, as `Buffer` did).
* `CharacterAnimator` ports `CDrawPrimitive_XSI_Animation` (`setAnimation` only switches
  when the set differs, `animate` wraps and reports the end, `animateStep` gives
  `newFrame`/`frameIndex` for `Animate_RetObj`). `modelPoint(point, angle)` gives the
  anchor in cells: `(x * s, pFactor * y * s, -z * s) / 32`, as in `FillXSIInfo`.
* `ClipAnimator` ports the frame logic of the movie clip primitives (`animate`, `cycle`,
  `randomize`, `goTo`).
