# Input

Source: `CInput.as`, `CSaveData.as` (default bindings), `CThing_Creature_Player.as`
(control lookup). Port: `src/adapters/input/`, listeners in `src/entry/listeners.ts`.

## Bindings

Settings store the original Flash key codes. `keyCodes.ts` maps them to
`KeyboardEvent.code` (layout independent, so `/` is the physical slash key).

| Up | Down | Left | Right | Fire | Next | Previous |
|---|---|---|---|---|---|---|
| KeyW (87) | KeyS (83) | KeyA (65) | KeyD (68) | Space (32) | KeyE (69) | KeyQ (81) |

These defaults replace the original arrows, Slash, Period and Comma (`ORIGINAL_KEYS`).
Settings version 4 swaps stored keys that still equal the original defaults; rebound keys
stay (`docs/persistence/settings.md`).

There is one local player (ADR 0005). `KeyP` shows or hides the upgrade list (the game keeps running). `Digit0`..`Digit9` select weapons,
and Space is a second fire key (`AddAdditionKeyCode`, which the original added when
`mTotalPlayerCount == 1`). Both now apply in every mode, because every player has their
own keyboard. Online, the same `PlayerInput` is sent to the server as bit masks
(`docs/runtime/online.md`).

## Edge semantics

`CInput` updated every key on key events and at the end of each frame: `mPressed` latched
on the down transition and stayed set until `IsPressed()` consumed it; `IsReleased()`
consumed the release. The port:

* `KeyboardState` records the held set plus press and release edges from browser events
  (auto-repeat is ignored, a window blur releases everything).
* `TickInputSampler.sample` runs once per logic tick and builds `TickInput`: per control
  `down` (any bound key held), `pressed` and `released` (edges since the last tick) and
  `heldTicks` (consecutive ticks held). It then clears the edges. A tap between two ticks
  arrives as `pressed` and `released` with `down` false. The domain's `LatchedControl`
  keeps an edge until game code consumes it, which is the `IsPressed` contract.
* `sample` returns the `TickInput` and `upgradeListPressed`, the P key's press edge. The
  session toggles the list; the world never sees the key.

The entry listener calls `preventDefault` for bound keys so arrows, Space and `/` do not
scroll or open quick find, except while a form control has focus. Key presses (not
auto-repeats) also go to the active screen (`Screen.key`); the controls window consumes
them while it waits for a key, and the listener then calls `preventDefault` too.

Mouse: pointer down, up, move and leave on the canvas are mapped to stage coordinates
(the canvas captures the pointer on down, so a release outside still arrives). The game
hit-tests presses against the QUIT? button on the upgrade list. Menus track hover and press per target, fire `onPress`/`onRelease` actions and set
the hand cursor (`docs/runtime/screens.md`).
