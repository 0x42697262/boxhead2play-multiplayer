# Rendering

Source: `DrawPrimitive/**`, `World/CWorld.as` (`InitDrawPlanes`, `Draw`, `Draw_PlayerPlane`),
`World/Init/CWorld_Init_Piece.as`, `World/Map/CMap_Decal.as`, `World/CHud.as`. Port:
`src/adapters/render/`. Decision record: [ADR 0004](../adr/0004-canvas-rendering-and-caching.md).

## Layers

| Module | Job |
|---|---|
| `geometry/` | Flash matrices (`[a, b, c, d, tx, ty]`, `concat` = apply first, then second) and rectangles. |
| `color/` | Color transform math, pixel filters (box blur, glow, drop shadow, blur, color matrix) on `ImageData`. |
| `symbols/` | `SymbolLibrary` (characters, `getBounds`) and `SymbolRenderer` (display-list replay on canvas). |
| `clips/` | `CDrawPrimitive_MovieClip_*` buffering: `bufferLayout`, `clipPlans`, `ClipBuffers`. |
| `xsi/` | `CDrawPrimitive_XSI_*`: style sheets, plane lists, `XsiRasterizer`, `XsiFrameCache`. |
| `world/` | `CWorld` planes and per-camera drawing: `RoomPlanes`, `VisualPainter`, `WorldRenderer`. |
| `hud/` | `CHud` drawing: score popups, messages, player labels, score total, frags, upgrade list. |

Everything draws into `OffscreenCanvas` surfaces (`surface.ts`). The visible canvas only
receives the finished 640 x 480 stage.

## Display-list replay (`SymbolRenderer`)

* Shapes, static texts and baked morphs are SVG images drawn at `bounds.xMin/yMin` with
  `setTransform(matrix)`. Morphs use the placement `ratio`.
* Sprites draw `frames[frame]` in depth order. Nested sprites are drawn at frame 0 (the
  state right after `attachMovie`) unless an override sets the frame.
* Overrides (`ChildOverride`) replace a named child's frame, matrix, visibility, alpha,
  text, text color or letter spacing. They model `_Contents.gotoAndStop`, `_rotation`,
  `_Top.transform.matrix`, `tf.text` and duplicated clips. Menus also use `characterId`
  (`attachMovie` at an occupied depth), `attach` (`attachMovie` at a new depth, merged
  by depth), `filters` (`mc.filters = [...]`), `buttonState` (`over`/`down` records) and
  `clip` (a local clip rectangle, used to cut the PLAY word out of a label).
* `LayeredStage` (`menu/`) caches each top-level layer of a screen as a stage-space
  bitmap keyed by its overrides and recomposes only when a key changes
  (`docs/runtime/screens.md`).
* `clipDepth` masks: the masked items render into a layer, the mask into a second layer,
  then `destination-in`. Mask alpha is not ignored as Flash does, which only matters for
  semi-transparent masks (none found in the HUD and room symbols).
* Color transforms: alpha-only transforms become `globalAlpha`. Any other transform
  renders the leaf into a layer and applies `mult * c + add` per pixel.
* Filters: glow, outer gradient glow, drop shadow, blur and color matrix are applied per
  pixel on a layer padded by the filter extent. A gradient glow maps the blurred, strength-
  scaled alpha (0..255) through a 256-entry lookup built from `gradientColors` and
  `gradientRatio`, then draws the source on top. The only gradient glow in the SWF is the
  rocket's (`Shot.Rocket` `_Contents`): it merges the three spinning white dots into one
  yellow-white projectile. Inner glow, inner shadow, on-top gradient glow, bevel, gradient
  bevel and convolution are ignored. Flash's blur kernel is approximated by a box blur of
  radius `floor(blur / 2)` per pass.
* Edit texts draw with the exported WOFF font (`swf-font-<id>`), alignment from the field,
  baseline at `yMin + 2 + fontBoundingBoxAscent`. HTML initial text is stripped to plain
  text.
* Buttons draw their `up` records, or the records of the override's `buttonState`.

### SVG images and `preserveAspectRatio`

Firefox rasterizes an SVG image at the final device size and then applies the SVG's
`preserveAspectRatio` (default `xMidYMid meet`). Under a non-uniform scale (the room
backgrounds use `1.2 x 0.84`) the drawing was letterboxed and left the red floor fill
visible. `GraphicImages` therefore fetches each SVG and sets
`preserveAspectRatio="none"` on the root element before decoding it from a blob URL. The
asset pipeline could emit the attribute directly in a later format version.

## Buffered clips (`clips/`)

`RenderMovieClipAsBitmapObject` is ported as `bufferLayout(bounds, scaleX, scaleY, inflate)`:
floor/ceil the `getBounds` rectangle, scale its size, inflate by 8 (clips), 2 (XSI) or 0
(HUD), size the bitmap with `ceil`, displacement `mDisp = floor(x * scale)`.

| Mode | Original | Port |
|---|---|---|
| Static | one bitmap of frame 1 | `ClipBuffers.staticClip` |
| Animation | one bitmap per frame of `_Contents` (or of the clip) | `animationFrame(symbol, frame)` |
| Directional | per direction, `_Contents._rotation = d * 360 / n`, then each frame; decals use `pGlobalScale (1, 0.6)` | `directionalFrame(symbol, n, d, frame, scale)` |
| OmniDirectional | for `a = 0; a < 2PI; a += 2PI / n`: `_Top` gets the skewed half-height matrix, `_Front` the standing matrix | `omniFrame(symbol, n, index)`, index from `mLookup256[n][angle * 256 / 2PI & 0xFF]` |

A clip without `_Contents` ignores the directional rotation, as in the original (rotating
the root does not change `getBounds(mc)` or `BitmapData.draw(mc)`). Bitmaps are created
lazily and cached for the session.

Drawing follows `Render`: `copyPixels` at `floor(pos + mDisp)` when alpha is 100 and scale
is 1, otherwise a scaled draw with alpha. `Static` and `OmniDirectional` ignore the scale.

## XSI characters (`xsi/`)

* `styleSheets.ts` ports `SS_SWAT/BOND/GIJOE/BAMBO/ZOMBIE/DEVIL`: hidden models, the
  sheet-level group remap plus the remapped model names, texture linkages and colors. The
  models list comes from `Player_Handgun_Walk` direction 0 frame 0 (`GetStyleSheet`).
  Setting a color on a material that does not exist (`Cloth`) is a no-op, as in AS2.
* `framePlanes.ts` ports `CDrawPrimitive_XSI_DI.Render`. For each model in source order:
  an `Empty` model takes the render partner's model (`mGroups[rPartner][animID]`), an
  invisible style model is skipped, a remapped model takes `mGroups[sheet.mGroup_Remap][animID]`.
  The plane holds the profile edges (`PEdge` material, 2 px) and the polygons. Arrays are
  walked newest first (AS2 `for..in`), so the last polygon of a list is drawn first.
  Model plane depth `10000 - n` for the n-th visited model means source order bottom to
  top.
* Fills: `Shape_Matrix` non-zero and a texture linkage gives a repeating pattern of the
  linkage sprite rendered at `mSize` (64 x 64) with the shape matrix. Otherwise a flat
  `mColor`/`mAlpha` fill. `Shape_Brightness` adds a white (positive) or black (negative)
  fill at `100 * |b| * 0.5` percent.
* Missing textures: `Bond_Head_*`, `GIJOE_Head_*`, `Swat_Head_*` are not exported. The
  original kept whatever the shared material bitmap held from the previously applied style
  sheet. The port uses the master material's linkage (`Head_*_MC`), which is the head
  texture that bitmap most likely held.
* `XsiRasterizer` builds the bitmap like `RenderToBitmap`: bounds of all polygons, edges
  (plus half the stroke) and shadows, scale by the style sheet scale (0.35, devils 0.42),
  inflate 2. The shadow layer is drawn first with
  `DropShadowFilter(0, 0, 0, 1, 4, 4, 0.25, 1, false, false, hideObject = true)`, so only
  a soft 25 % shadow remains. Then the planes, then `GlowFilter(0, 1, 4, 4, 2, 1)` over the
  whole bitmap (the black outline).
* `XsiFrameCache` renders lazily per `(style, scale, set, direction, sourceFrame)`.
  `prewarm` drains a queue in idle time; a game queues both player styles, the devil and
  the zombie in the order `ProcessBGTasks` did (the stack was popped, so zombies first).

## World (`world/`)

* `RoomPlanes` ports `InitDrawPlanes` and `CWorld_Init_Piece.Draw`: the floor (red fill,
  room background items, then each piece at its translation), the cover plane (each
  `_Cover` at its position) and the decal mask (opaque everywhere except where pieces
  are, the result of `InvertAlpha`). Bitmap sizes truncate the room size.
* `stampDecal` ports `QRender_Mask`: the directional buffer frame at
  `floor(xPx + mDisp)`, masked by the decal mask at the same position, drawn into the
  floor.
* `WorldRenderer.render` ports `CWorld.Draw` for the local player's camera
  (`localCamera`: the frame's `localPlayerIndex`, 0 in single play):
  floor copy at `-round(-(rect + shake))`, things in `drawList` order, overlay lines and
  squares after all things (the `mcScratch` clip), then the cover plane. Positions are
  `x * 32 - drawOrigin.x`, `(y + z * pFactor) * 32 - drawOrigin.y`; lines use the rounded
  `ConvertCellToScreen`.
* Every mode draws one full 640 x 480 view. The original deathmatch split screen (two
  480 x 480 views scaled side by side) is gone with local two-player play (ADR 0005).
* Brightness: `presentation.brightness * 255` added to RGB with `lighter` over the whole
  stage, before the HUD.

## HUD (`hud/`)

Bitmap layer (drawn into the stage after brightness, like `CHud.Draw`): score popups
(`+points`, speed 5 toward the score total, x1.05 per draw, alpha `y - 40` above y 140)
and messages (start at the bottom center, move a quarter of the remaining 100 px per draw,
older messages pushed by 19 px, fade after 2.5 s of the 3 s lifetime).

Live layer (the clips that Flash composited above the bitmap): `Hud.ScoreTotal` at
(320, 0) with the 12-digit score, `x<multiplier>` and the timer frame;
`Hud_PlayerFrags` in deathmatch (left: the local player; right: the opponent with the
most frags, hidden when alone; names are the online names or "Player N"; `mcSwitchSides`
hidden); one `HUD.Player` per player (life frame
`floor(min(max(1, 101 * ratio + 1), 101))`, ammo text `<short name>:<ammo>`, letter spacing
-2); `HUD.Paused` as the upgrade list, drawn over the running game with the "PAUSED!"
title (depth 14) hidden (one row more than a third per column, 17 px rows,
green for new weapons, 25 % alpha when inactive). The player labels use the previous
frame's draw origin, as `UpdatePlayer` ran before `Draw_PlayerPlane`.
`hitTest` maps clicks on `_Quit` while the list is shown.

## Known visual gaps

* Bevel, gradient bevel, inner glow and inner shadow filters are not drawn
  (wall tiles, the floor splats and a few menu texts use them).
* Blur kernels and text layout are approximations of Flash's.
* Nested sprites inside buffered clips always show frame 0 (Flash would advance
  independently playing children between frames).
* Character frames render on first use instead of all at load time; the first sight of an
  animation can cost a few milliseconds.

## Verifying without a test browser

`node --input-type=module -e "const { runnerImport } = await import('vite'); await runnerImport('./scripts/local/render-pipeline.ts')"`
plans every clip buffer and every XSI frame of the prewarm collections from the real
catalogs and reports NaN layouts. `scripts/local/browser-check.mjs` drives a headless
Firefox (`--remote-debugging-port 9222`) over WebDriver BiDi against `vite preview` and
saves screenshots. Both scripts are local (`scripts/local/` is not committed).
