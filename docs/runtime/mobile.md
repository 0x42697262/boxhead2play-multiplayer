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
