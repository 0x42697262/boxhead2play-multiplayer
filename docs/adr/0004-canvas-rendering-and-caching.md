# ADR 0004: Canvas 2D rendering with lazily cached bitmaps

Status: accepted

## Context

The original draws almost nothing live. Things, decals, characters and HUD messages are
rasterized once into `BitmapData` (`CDrawPrimitive_MovieClip_*.Buffer`,
`CDrawPrimitive_XSI_Animation.RenderToBitmap`, `CHud.RenderMovieClipAsBitmapObject`) and
then blitted with `copyPixels` every frame. The stage is 640 x 480 at 25 ticks per second.
XSI characters are vector polygons per frame with style-sheet materials, a filtered
shadow and an outline glow; rendering every frame of every set takes seconds, which the
original did behind a loading screen (`InitCleanUp` waited for `RenderStack_Finished`).

ADR 0002 already exports vector shapes as SVG and keeps display lists as data. We need a
browser renderer that reproduces the original's bitmaps, their offsets (`mDisp`) and the
blit order, and that stays fast on low-end machines.

Options:

1. **WebGL.** Fast, but every SVG would have to be rasterized to textures anyway, filters
   rewritten as shaders, and text drawn separately. Large code and a second rendering
   model for a 640 x 480 game.
2. **Canvas 2D, live vectors every frame.** Simple, but draws hundreds of SVG images and
   thousands of XSI polygons per frame, and the filters (glow, drop shadow) would run
   every frame.
3. **Canvas 2D with the original's caching.** Rasterize exactly where the original called
   `BitmapData.draw`, keep the result as an `OffscreenCanvas` with its displacement, and
   blit.

## Decision

Option 3.

* Every original rasterization point has a port: `bufferLayout` (bounds, scale, inflate,
  `mDisp`), `ClipBuffers` for the four movie clip primitives, `XsiRasterizer` for XSI
  frames, `HudRenderer.clip` for HUD bitmaps, `RoomPlanes` for floor, cover and decal mask.
* Bitmaps are created lazily on first use and cached for the session: clips per
  `(symbol, mode, direction, frame, scale)`, characters per
  `(style, scale, set, direction, sourceFrame)`, HUD clips per text and frame (bounded, the
  cache is cleared when it reaches 256 entries).
* Character frames are additionally prewarmed in idle time at most 6 ms per animation
  frame, in the original `RenderStack` order, instead of blocking the world start.
* Filters run on `ImageData` while a bitmap is built, never per frame. Unsupported filters
  (bevel, gradient variants, inner effects) are skipped.
* The visible canvas is 640 x 480. CSS scales it to the window: whole multiples with
  `image-rendering: pixelated` when the window is at least 640 x 480, smooth fractional
  downscaling below that. The original stage was bitmap based (`copyPixels`), so crisp
  integer scaling matches it best; the smooth fallback keeps small windows usable.
  Superseded by [ADR 0006](0006-render-resolution.md): this is now the `pixelated` graphics
  quality, and the default renders at the screen's resolution.

## Consequences

* Frame cost is a few dozen `drawImage` calls plus the floor and cover copies, well within
  budget.
* The first appearance of a character animation costs a few milliseconds per frame
  rendered on demand; prewarming hides most of it during the first seconds of a game.
* The bitmaps are as sharp as the original's (1x stage pixels). Supersampling for HiDPI
  would need every layout scaled, which this decision does not cover.
* Pixel filters need readable canvases. If a browser taints a canvas that drew an SVG
  image, `readPixels` fails and the bitmap is used without the filter.
* `OffscreenCanvas` is required (Chrome 69, Firefox 105, Safari 16.4).
