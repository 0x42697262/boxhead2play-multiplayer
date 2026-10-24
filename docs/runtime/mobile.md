# Phones and tablets

The game runs in mobile browsers in landscape, as large as the screen allows. The design
follows Apple's Human Interface Guidelines: the game stays the focus, system-style
materials and type for the few native elements, 44 pt touch targets, safe areas respected,
and reduced motion and transparency honored.

## Page

* `index.html`: `viewport-fit=cover` (draw under the notch, then keep controls inside
  `env(safe-area-inset-*)`), no zoom, black theme color, and the Home Screen web app meta
  tags (`apple-mobile-web-app-capable`, `black-translucent` status bar).
* `shell.css`: no scrolling, rubber-banding, text selection, callouts, tap highlights or
  browser gestures (`touch-action: none`). iOS pinch zoom (`gesturestart`) is cancelled in
  `listeners.ts`. `#app` uses `100dvh`, so the stage fits between Safari's bars.
* `manifest.webmanifest` is generated from `en.json` by `tools/build/webManifest.ts` (Vite
  plugin, served in dev, emitted in builds): `display: fullscreen`, `orientation: landscape`.
  The Home Screen name is `app.shortTitle`.

## Full screen

Browsers allow full screen only inside a user gesture, and for touch only on `pointerup`
(a touch `pointerdown` is not a user activation). `listeners.ts` therefore reports every
`pointerup` and `keydown` as a gesture. A touch gesture calls `enterLandscapeFullscreen`
(`src/adapters/display/fullscreen.ts`): `requestFullscreen({ navigationUI: 'hide' })`,
then `screen.orientation.lock('landscape')` where the browser supports it. The same gesture
handling now retries the audio unlock until the `AudioContext` runs; before, one early touch
could leave iOS silent.

If the player leaves full screen, only a menu tap enters it again, never a tap during play.
`entersFullscreenOnTap` (`src/ui/mobile/fullscreenTap.ts`) decides from the current screen's
`touchLayout` (see below): menu screens (`hidden`, or none) and the in-game Esc menu
(`menu`) re-enter, `play` does not. Before, every touch `pointerup` re-entered, so Fire, the
stick or a weapon button threw a player who had left full screen back in mid-fight, and the
canvas resized during play. The TAB upgrade list and the player list keep the `play` layout,
so taps there do not re-enter either. The window listener runs after the touch controls and
the canvas have handled the `pointerup`, and screen changes wait for the next frame, so:

* the tap that starts a game from a menu still counts as a menu tap;
* the pause button's tap opens the Esc menu first, so it re-enters (the game is behind the
  menu); the close button's tap closes the menu first, so resuming play does not.

New touch layouts do not re-enter unless they are added to `FULLSCREEN_TAP_LAYOUTS`.

iPhone Safari has no full screen API for pages. There, a glass banner at the top says
"Play in full screen: Tap Share, then Add to Home Screen." for 10 s
(`HOME_SCREEN_HINT_MS`) or until closed. It appears only when `navigator.standalone` is
`false` (Safari on iOS, not yet on the Home Screen) and `document.fullscreenEnabled` is
false. Started from the Home Screen, the game runs without browser bars.

## Portrait

On touch screens (`pointer: coarse`) in portrait a black screen with a turning phone
says "Turn your device sideways to play." (pure CSS media query, `MobileChrome.ts`).

## Touch controls (`src/ui/touch/`)

`TouchControls` is a DOM layer over the canvas, shown while a game runs and the last input
was a touch (`pointerup` from a non-mouse pointer, or a coarse pointer at boot). A mouse
click or a key hides it again. It does not touch the game code: every control presses a
virtual key in the shared `KeyboardState` (`TouchCode.*` in
`src/adapters/input/touchCodes.ts`), and `buildBindings` adds those codes next to the
keyboard keys. Single play and online play therefore read touch exactly like WASD, the
online client sends the same control masks, and rebinding keys never breaks touch.

| Control | Place | Virtual keys |
|---|---|---|
| Stick | bottom left; the whole lower-left area (45 % x 75 % of the screen) is a touch zone. The base never moves: wherever the thumb lands in the zone, the direction is measured from the base's center (fixed stick) | `TouchUp/Down/Left/Right` |
| Fire | bottom right, 88 px | `TouchFire`, held while pressed |
| Previous / next weapon | above Fire, 52 px | `TouchPrevWeapon`, `TouchNextWeapon` |
| Menu | top left, 44 px, pause glyph; becomes a close glyph while the Esc menu is open | sends `Escape` through `ScreenFlow.key` |
| List | next to Menu | `TouchUpgradeList` (`` ` ``: upgrades in coop and single, scoreboard in deathmatch) |
| Players | next to List, held | `TouchPlayerList` (held TAB: the online player list) |

`stickSector` turns the thumb offset into one of eight equal 45 deg sectors, the eight WASD
directions (`directionsOf`). Without help a thumb resting near a sector edge flips between
two directions on a 1 px wobble, which players feel as the stick "going where it wants".
So the held sector has hysteresis: it stays until the thumb is 12 deg past its edge
(`STICK_SECTOR_HYSTERESIS_RADIANS`), and the dead zone (22 % of the 44 px travel) releases
only at 60 % of that radius (`STICK_RELEASE_FACTOR`). The base stays put (owner request:
a floating base that jumps under the thumb or trails it past the rim felt like the stick
"moving somewhere"); only the knob moves. The knob is clamped to the travel and springs back on release.
Several fingers work at once (stick plus Fire plus a weapon button) through pointer
capture per control. Leaving the play layout releases every virtual key.

The press and stick state lives in `TouchInputState`, which has no DOM and is unit tested
with a real `KeyboardState`; `TouchControls` only wires pointer events and styles to it.
The stick compares each new direction with `KeyboardState.isDown`, not with a remembered
copy: a window blur (or releasing Cmd) releases the virtual keys too, and the next thumb
movement presses them again without crossing into another sector. Once per animation
frame, `TouchControls.sync` sets each button's pressed look from the key state, so a
released key never shows as pressed. The base's rest center comes from its layout box
(`offsetLeft`/`offsetTop` inside the zone), not from `getBoundingClientRect`, which would
include the 0.25 s spring-back transform and put the base off center on a quick re-touch.

Design (Apple Human Interface Guidelines): translucent white circles with a thin edge, white
SF-style line glyphs, a spring press scale of 0.92, an 8 ms `navigator.vibrate` tap where
the browser supports it (not Safari), all controls inside the safe areas, at least 44 px.
The game controls skip `backdrop-filter`: blurring a canvas that redraws every frame costs
frame rate on phones, the reason the page goes full screen in the first place. While the
Esc menu is open only the menu button stays, as a close button; the menu's own items are
tapped on the canvas. `prefers-reduced-motion` drops the animations and `prefers-contrast:
more` darkens the fills.

Each screen reports its `touchLayout` (`ScreenFlow.Screen`): `GameScreen` and
`OnlineGameScreen` return `play`, or `menu` while the Esc menu is open; every menu screen
has none and the layer hides. `main.ts` calls `TouchControls.sync` once per animation frame.

## On-screen keyboard (`src/ui/mobile/SoftKeyboard.ts`)

NAME and JOIN BY CODE are drawn on the canvas, and a canvas cannot open a phone keyboard.
A screen that edits text reports `textEntry` (`ScreenFlow.TextEntry`: kind, draft, max
length); only `MainMenuScreen` does. After a touch `pointerup`, `main.ts` calls
`SoftKeyboard.open()`, which focuses a hidden `<input>` (16 px font so iOS does not zoom,
`enterkeyhint="done"`, autocorrect and spellcheck off, capitals for codes, words for names).
iOS opens the keyboard only for a focus inside a user gesture, so it must happen in that
`pointerup`; the window listener runs after the canvas listener, so the screen already has
its draft.

The input is not the source of truth. On every `input` event, `textEdit(previous, value)`
turns the change into backspaces and typed characters for `ScreenFlow.key`, the same path a
physical key takes. Then the input is reset to the screen's draft, so names keep their
length limit and codes their alphabet and uppercase. During an IME composition the input is
left alone and the next diff corrects it. Characters outside the BMP (emoji) are dropped, as
with a physical keyboard. Done or Enter confirms, Escape cancels, and closing the keyboard
(blur) confirms. When the draft ends another way, the next animation frame blurs the input.

The canvas `pointerdown` calls `preventDefault`. Without it, the compatibility `mousedown`
after a tap moves focus to the page, blurs the input and confirms the entry at once.

While the keyboard is open the stage fits the visible area: `visibleViewport` (in
`src/main.ts`) uses `visualViewport` and writes `--visible-top` / `--visible-height` for
`#app`, `Shell.layout` resizes the stage at once (the resolution follows when the resize
settles, see `docs/runtime/rendering.md`), and the
viewport meta has `interactive-widget=resizes-content` for Android Chrome. So the label
being edited stays visible above the keyboard.
