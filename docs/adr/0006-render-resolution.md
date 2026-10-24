# ADR 0006: Render at the screen's resolution, with a graphics quality option

Status: accepted

## Context

The port drew everything into a 640 x 480 canvas and let CSS scale it to the window in whole
multiples with `image-rendering: pixelated` (ADR 0004). On a 1920 x 1080 window that is a
2x nearest-neighbor zoom: one-pixel outlines (the black glow around barrels and characters)
become two-pixel steps, and the menus, character cards and text look blocky. The owner
compared it with the Flash original and asked for the sharp look, with the old behavior kept
as an option.

Flash renders vector art (menus, HUD clips) at the size of the player window. The game world
itself is a 640 x 480 bitmap (`CWorld.bmDraw`, attached with smoothing off), and every clip,
decal and character frame is buffered to bitmaps (`RenderMovieClipAsBitmapObject` with
`pGlobalScale`).

Options:

1. Keep a 640 x 480 canvas and only change the CSS scaling (smooth instead of pixelated).
   No blocky edges, but nothing gets sharper.
2. Render menus at the window resolution and keep the world at 640 x 480, as Flash does.
3. Render everything at the window resolution: the canvas and every buffered bitmap use a
   resolution factor (device pixels per stage pixel).

## Decision

Option 3, chosen by the `graphics` setting (`GraphicsQuality`):

* `sharp` (default): the canvas fills the window at `fit x devicePixelRatio` device pixels per
  stage pixel, rounded up to steps of 0.25 and limited to 1..3 (`src/ui/shell/tuning.ts`).
* `smooth`: a 640 x 480 canvas stretched to fill the window with smoothing.
* `pixelated`: the previous behavior, a 640 x 480 canvas in whole multiples with hard pixels.

`Shell` computes the fit (`stageFit`) and exposes `resolution`. Every bitmap producer takes
it: `LayeredStage` (menus), `ClipBuffers` (as the original's `pGlobalScale`), `XsiRasterizer`
and its textures, `RoomPlanes`, `HudRenderer` and `WorldRenderer`. Positions stay in stage
pixels; bitmaps, their displacement and the world screen are in device pixels, so `blit`
multiplies the position by the resolution. Filter blur and distances scale with the
resolution, as Flash scales filters when the stage is zoomed.

A resolution change (window resize, moving to another screen, a new quality) clears the
bitmap caches. `WorldRenderer` rebuilds its room planes and stamps the decals of the game
again, so blood stays on the floor (since ADR 0008 only when the plane resolution
changes). `XsiFrameCache` queues the character frames it had rendered for idle prewarm
again. A window resize takes effect for the resolution only once
the resize events stop for `RESIZE_SETTLE_DELAY_MS`; the CSS size follows at once.

## Consequences

* Menus, text, character cards, characters and objects are sharp on large and high-DPI
  screens. The look differs from the original, whose world is a 640 x 480 bitmap; recorded in
  `docs/porting/deviations.md`.
* Bitmap memory grows with the square of the resolution, hence the limit of 3. The room
  planes are as large as the room and can exceed browser limits; they have their own
  resolution since [ADR 0008](0008-room-plane-resolution.md). A resize
  re-renders the caches lazily; character frames prewarm again in idle time.
* Pixel snapping happens in device pixels, so objects move in smaller steps than in the
  original at resolutions above 1.
