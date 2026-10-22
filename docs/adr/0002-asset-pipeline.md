# ADR 0002: Replay SWF display lists from SVG shapes at runtime

Status: accepted

## Context

The original renders in two ways:

* **MovieClip trees.** Screens, HUD, effects, objects and the room layout are authored
  timelines of vector shapes, morph shapes, texts and buttons. They have matrices, color
  transforms, filters and masks.
* **BitmapData drawn from clips.** The original rasterizes clips at runtime with
  `BitmapData.draw`. Examples: room floors (`bmFloor.draw(mcRoomData)`, then each piece at
  its origin), covers, decals, and the XSI character frames, which are drawn into bitmaps
  with style-sheet materials. Some materials are clips (`mcLinkID`) drawn into a texture
  bitmap first.

The game logic also reads geometry from clips: `_width`, `_height`, `getBounds`,
`localToGlobal` (`CWorld_Init`, `CWorld.mArea`).

We need assets that a browser canvas can render at any resolution. They must reproduce
the same rasterization points (floor, cover and texture bitmaps), and they must give the
simulation the same numbers. There is no image library in the toolchain (no node-canvas,
no PIL), and we want no runtime dependencies beyond Zod.

Options:

1. **Pre-rasterize PNGs** per sprite frame, room floor and texture with FFDec `-export frame/sprite`.
2. **Export vector shapes as SVG and replay the display lists at runtime.** The runtime
   draws them with canvas `drawImage` under the same matrices, and rasterizes into
   offscreen canvases wherever the original used `BitmapData.draw`.

## Decision

Option 2. `tools/extract` exports every DefineShape and DefineText as a standalone SVG in
its own coordinate space, and bakes morph shapes per used ratio. It writes one
`library/symbols.json` that contains, for every sprite, the fully resolved display list of
every frame. Each item has a pixel matrix `[a, b, c, d, tx, ty]`, color transform,
filters, clip depth and ratio. The file also has per-frame bounds, exports, registered
classes, buttons, edit texts and frame scripts. Rooms and characters are separate catalogs
derived from the same replay (`rooms/*.json`) and from the evaluated XSI data
(`characters/xsi.json`).

Reasons:

* A canvas transform reproduces the Flash matrix model exactly. Vectors stay sharp at any
  zoom and in the scaled DeathMatch split screen. PNGs would fix one scale and blur when
  transformed.
* Runtime rasterization points stay where the original had them. The floor, cover and
  decal-mask canvases are built with the same draw order and translation-only matrices as
  `CWorld_Init_Piece.Draw`. Character textures can be built from the `mcLinkID` sprites with
  the style-sheet tint applied, which pre-baked PNGs could not do per style sheet.
* Per-frame display lists keep timelines data-driven. Screens and effects can be
  animated, have their frames looked up by label, and have their text fields replaced,
  without one PNG per frame.
* Bounds computed during extraction answer `_width`/`getBounds` questions in the
  simulation without a renderer.
* The output stays small (about 9 MB in total, most of it XSI vertex data) and needs no
  native dependencies.

## Consequences

* The runtime needs a small display-list renderer. It has to handle matrix stacks, color
  transforms, `clipDepth` masks, morph ratio lookup, nested sprite timelines (restart when
  `instance` changes), and drawing SVG images at `bounds.xMin/yMin`.
* Filters (bevel, glow, drop shadow, blur, color matrix) exist only as data. Canvas has to
  approximate them (`ctx.filter`, `shadowBlur`, precomputed variants) or drop them. Bevel
  and gradient glow have no direct equivalent.
* SVG images decode asynchronously. The asset loader has to preload the SVGs a screen or
  room uses before first draw, and should cache rasterized bitmaps per scale.
* FFDec's SVG output is now part of the format contract. The pipeline validates every SVG
  against the SWF bounds and rejects external references. A different FFDec version that
  changes the layout fails loudly. `formatVersion` versions the catalogs.
* Static text renders from SVG glyph outlines. Dynamic text renders from `editTexts` plus
  the exported WOFF fonts. These can differ slightly from Flash's text layout.
