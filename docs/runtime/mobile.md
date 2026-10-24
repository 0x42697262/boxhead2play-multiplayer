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
then `screen.orientation.lock('landscape')` where the browser supports it. If the player
leaves full screen, the next tap enters it again. The same gesture handling now retries the
audio unlock until the `AudioContext` runs; before, one early touch could leave iOS silent.

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
| Stick | bottom left; the whole lower-left area (45 % x 75 % of the screen) is a touch zone. A touch on the base grabs it; a touch elsewhere moves the base under the thumb (floating stick) | `TouchUp/Down/Left/Right` |
| Fire | bottom right, 88 px | `TouchFire`, held while pressed |
| Previous / next weapon | above Fire, 52 px | `TouchPrevWeapon`, `TouchNextWeapon` |
| Menu | top left, 44 px, pause glyph; becomes a close glyph while the Esc menu is open | sends `Escape` through `ScreenFlow.key` |
| List | next to Menu | `TouchUpgradeList` (TAB: upgrades in coop and single, scoreboard in deathmatch) |

`stickDirections` turns the thumb offset into the eight WASD directions: a dead zone of
22 % of the 44 px travel, then each axis counts when its share exceeds sin(22.5 deg),
so the eight sectors are equal. The knob is clamped to the travel and springs back.
Several fingers work at once (stick plus Fire plus a weapon button) through pointer
capture per control. Leaving the play layout releases every virtual key.

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
has none and the layer hides. `main.ts` syncs it once per animation frame.
