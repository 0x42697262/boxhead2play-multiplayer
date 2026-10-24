# Asset pipeline

`tools/extract/` regenerates `public/assets/` from the original SWF. Nothing under
`public/assets/` is committed; rerun the pipeline instead. The design decision behind it
is [ADR 0002](../adr/0002-asset-pipeline.md).

## Running it

Requirements: Java 8 or newer on `PATH` (FFDec's classes target Java 8, class file version 52;
runs are verified on Java 21) and the SWF, which is committed. FFDec itself is provisioned
automatically, see "Automatic setup" below.

```sh
npm run extract                       # regenerate public/assets
npm run extract:debug                 # floor composites for ROOM_Single_0001 and 0002
npm run extract:debug ROOM_Single_0013
```

Configuration comes from environment variables. `tools/extract/config.ts` is the only
module that reads them. It validates them at startup and stops with a message that names
the variable and the path.

| Variable | Default | Meaning |
|---|---|---|
| `SWF_PATH` | `boxhead2play.swf` | The original game. |
| `FFDEC_JAR` | unset: download the pinned FFDec into `.cache/ffdec/26.4.0/` | A local JPEXS FFDec jar to use instead. |
| `ASSET_OUT_DIR` | `public/assets` | Output root. The pipeline deletes and rewrites only its own entries (`manifest.json`, `library/`, `rooms/`, `characters/`, `sounds/`, `fonts/`). |

Relative paths resolve against the current working directory. A full run takes about
20 seconds. The output is deterministic: two runs produce identical `manifest.json` file
hashes.

## Automatic setup

`npm run dev` and `npm run build` first run `npm run setup:assets`
(`tools/setup/ensureAssets.ts`), so a fresh clone needs only `npm install` and `npm run dev`.

1. It compares `public/assets/extract-stamp.json` with the expected stamp: `formatVersion`,
   the SWF's SHA-256, a SHA-256 over the extractor sources (`tools/extract/**/*.ts` without
   tests, `debug/` and `testing/`) and the FFDec version. If everything matches and
   `manifest.json` exists, it prints "Game assets are up to date." and exits (well under a
   second).
2. Otherwise it prints the reason (`no-assets`, `no-stamp`, `swf-changed`,
   `extractor-changed`, `ffdec-changed`) and runs `tools/extract/main.ts`.
3. The extractor checks `java -version` (Java 8+), then resolves FFDec: `FFDEC_JAR` if
   set, else `.cache/ffdec/26.4.0/ffdec.jar`. If that is missing it downloads
   `ffdec_26.4.0.zip` from the JPEXS GitHub release (5 minute timeout), refuses any archive
   whose SHA-256 is not the pinned
   `56ce960aeafc7caf034e2052ba49f878a883f7c7ca690da6eeffca9587b5e4b9`, unzips it with
   `fflate` into a staging directory and renames it into place.
4. After a successful run the extractor writes the stamp. `npm run extract` always
   regenerates and also writes the stamp.

Pinned values live in `tools/setup/tuning.ts`; messages in `tools/setup/messages.ts`.
The Nix flake reads the same two pins (see `docs/deployment/nix.md`) and provides
`FFDEC_JAR`, so Nix builds and `nix develop` never download FFDec.
To upgrade FFDec, change `FFDEC_VERSION` and `FFDEC_ARCHIVE_SHA256` together. The version
change marks existing assets stale.

## How it works

1. A work directory is created under the OS temp dir (`boxhead2play-extract-*`). It is
   deleted when the run ends, including on failure.
2. FFDec runs twice (`tools/extract/adapters/ffdec.ts`):
   * `-swf2xml` writes the whole SWF as XML (export format major version 4 is required).
   * `-config autoDeobfuscate=1,as12DeobfuscatorExecutionLimit=1000000 -format shape:svg,morphshape:svg,text:svg,font:woff,sound:mp3_wav,script:as -export shape,morphshape,text,sound,font,script`.
     `-selectid` does not restrict script export, so all scripts are exported (about 15 s).
3. Pure modules turn the XML and exports into catalogs:
   * `xml/parseXml.ts`: minimal XML parser.
   * `swf/readSwfXml.ts`: XML to a typed SWF model (characters, control tags, exports).
   * `swf/timeline.ts`: display-list replay per sprite.
   * `swf/swfIndex.ts`: memoized timelines, linkage lookup, `getBounds` semantics.
   * `library/*`: `symbols.json`, normalized SVGs, baked morph shapes.
   * `scripts/*`: `Object.registerClass`, frame scripts, static tables in `__Packages`.
   * `rooms/*`: room composition and the select-screen index.
   * `characters/*`: XSI data evaluated in a `node:vm` sandbox.
   * `sounds/*`, `fonts/*`, `manifest.ts`.
4. Every catalog is validated with the runtime Zod schemas (`src/adapters/assets/schemas.ts`)
   before it is written. Then `manifest.json` is written.

## Conventions

* **Units.** All output coordinates are pixels. The SWF stores twips (1/20 px). Every
  bounds and position value is rounded to whole twips first, so values are multiples of
  0.05.
* **Axes.** Flash axes: x grows right, y grows down.
* **Matrices.** `[a, b, c, d, tx, ty]` with `x' = a*x + c*y + tx` and `y' = b*x + d*y + ty`,
  which is the same as canvas `setTransform(a, b, c, d, tx, ty)` and SVG `matrix(...)`.
  From the SWF `MATRIX`: `a = scaleX`, `b = rotateSkew0`, `c = rotateSkew1`, `d = scaleY`,
  `tx`/`ty` = translate / 20. Scale and skew are snapped to the SWF 16.16 fixed-point grid,
  so they are exact.
* **Drawing a graphic.** Each shape, static text and baked morph SVG covers exactly its
  `bounds`. In the character's local space, draw it at `(bounds.xMin, bounds.yMin)` with
  size `(xMax - xMin, yMax - yMin)`. Each SVG has a `viewBox`, so it stays sharp when a
  canvas draws it scaled. Bitmap fills are embedded as data URIs. An SVG loaded through
  `<img>` cannot fetch external resources, and the pipeline fails if one tries.
* **Color transforms.** `rMult..aMult` are multipliers (1 = unchanged). `rAdd..aAdd` are
  offsets in 0..255 units. Identity transforms are omitted.
* **Paths** inside a catalog are relative to that catalog's directory. Manifest paths are
  relative to the asset root.
* **`formatVersion`** is `1` in every JSON file (`ASSET_FORMAT_VERSION`). Schemas reject
  other versions.
* JSON is minified, except `manifest.json`. Use `jq` to read it.

## Output files

```
public/assets/
  manifest.json
  library/symbols.json
  library/shapes/<id>.svg          232 DefineShape1-4
  library/texts/<id>.svg           125 DefineText/DefineText2
  library/morphs/<id>_<ratio>.svg  281 baked morph frames
  rooms/index.json
  rooms/ROOM_Single_0001.json .. ROOM_Single_0018.json
  characters/xsi.json              ~3.6 MB
  characters/anim-meta.json
  sounds/index.json
  sounds/<name>.mp3                31 sounds
  fonts/index.json
  fonts/<fontId>.woff              8 fonts
```

### manifest.json

`{ formatVersion, source: { file, bytes, sha256 }, generator, catalogs: { symbols, roomIndex, rooms[], xsi, animMeta, sounds, fonts }, files: [{ path, bytes, sha256 }] }`

`source.sha256` identifies the SWF. `generator` is FFDec's version string. `files` lists
every emitted file except the manifest, sorted by path.

### library/symbols.json

`{ formatVersion, stage: { width, height, frameRate }, exports, classes, shapes, morphShapes, texts, editTexts, buttons, sprites, root }`

* `exports`: `{ [linkageName]: characterId }` from every ExportAssets tag (including
  `__Packages.*` class stubs).
* `classes`: `{ [linkageName]: className }` from `Object.registerClass` in the exported
  scripts, for example `"Piece.Cube1": "World.Init.CWorld_Init_Piece"`.
* `shapes[id]`: `{ bounds, svg }`. `bounds` is the SWF `shapeBounds`, including strokes.
  This is what Flash uses for `getBounds` and `_width`.
* `morphShapes[id]`: `{ startBounds, endBounds, ratios: { [ratio]: { bounds, svg } } }`.
  There is one baked SVG for every ratio (0..65535) that any timeline uses. A placement
  without a ratio uses ratio 0. All 32 morphs in this SWF have one solid fill and
  invisible strokes. The pipeline asserts this and interpolates the path linearly and the
  color per channel with rounding.
* `texts[id]`: `{ bounds, svg, text, fontIds, glyphs? }`. `text` is the decoded string (glyph index
  through the font code table, with `\n` when the record's y offset changes). `glyphs` lists
  one `{ char, x, advance }` per glyph in text-local pixels: `x` is the pen position (record
  `xOffset` plus the advances before it) through the text matrix's x scale and translation,
  which is the glyph `<use>` translation in the text SVG. The menu uses it to cut one word out
  of a label (`docs/runtime/screens.md`). The field is optional, so catalogs written before
  it existed still validate.
* `editTexts[id]`: `{ bounds, variableName, fontId?, fontSize? (px), color?, align? ('left'|'right'|'center'|'justify'), leftMargin?, rightMargin?, indent?, leading? (px), maxLength?, initialText?, wordWrap, multiline, password, readOnly, autoSize, noSelect, border, wasStatic, html, useOutlines }`.
  `initialText` is raw: when `html` is true it is Flash HTML. The instance name of a
  field comes from the placement (`name` on the display item).
* `buttons[id]`: `{ trackAsMenu, bounds (up state, or null), records: [{ states: ('up'|'over'|'down'|'hitTest')[], characterId, depth, matrix, colorTransform?, filters?, blendMode? }], conditions: string[][] }`.
  `conditions` lists the true `cond*` flags of each BUTTONCONDACTION. The action bytecode
  is not exported. Read `re/scripts/DefineButton2_*` instead.
* `sprites[id]` and `root` (main timeline, id 0):
  `{ frameCount, labels?: { [label]: frameIndex }, frames: DisplayItem[][], frameBounds: (Rect|null)[], frameSounds?: { [frameIndex]: [{ characterId, syncStop, syncNoMultiple, loopCount? }] }, scripts?: { [frameIndex]: string }, selfHidden? }`.
  * Frame indices are 0-based. Flash's `gotoAndStop(n)` is index `n - 1`.
  * `frames[i]` is the **fully resolved display list** after frame `i`, sorted by depth:
    PlaceObject (new, move, and character replacement with move), RemoveObject and
    ShowFrame are applied. A move keeps every property it does not set.
  * `DisplayItem = { depth, characterId, instance, matrix, name?, colorTransform?, filters?, clipDepth?, blendMode?, ratio?, visible?, hasClipActions? }`.
    `instance` is a per-timeline counter. It changes when a new object is placed or a move
    replaces the character, so a runtime knows when to restart a nested sprite's timeline.
    `clipDepth` marks a mask that clips depths up to that value.
  * `frameBounds[i]` is the union of the transformed bounds of all children of frame `i`.
    Invisible children count, as in Flash. Each nested sprite is measured at its own frame
    0, which is the state right after `attachMovie`. `null` means the frame is empty
    (Flash reports `_width = 0`).
  * `scripts` holds the deobfuscated frame actions with FFDec noise lines removed. The XSI
    data script is excluded.
  * `selfHidden` is true when frame 1 runs `_visible = false;` (sprite 98, the `_Size` clip).
* `filters` keep the SWF filter data with a `type` of `dropShadow | blur | glow | bevel | gradientGlow | gradientBevel | convolution | colorMatrix`
  and FFDec's attribute names (`blurX`, `blurY`, `angle` in radians, `distance`,
  `strength`, `passes`, `knockout`, `innerShadow`, colors as `{ r, g, b, a }`,
  `gradientColors`, `gradientRatio`, `matrix`). The runtime has to approximate them.
  The pipeline does not rasterize them.

### rooms/ROOM_Single_NNNN.json

`{ formatVersion, id, characterId, size: { width, height }, background: DisplayItem[], pieces: RoomPiece[], initObjects: RoomInitObject[], hiddenCharacterIds: number[] }`

This is how `World/CWorld.as` builds a level:

1. `attachMovie(mWorldLibLink)` creates the room sprite. Every child whose linkage is
   registered to a `World.Init.CWorld_Init_*` class runs `CWorld_Init()`. That constructor
   finds the world through `_parent` and calls `AddInitObject`, which sets
   `_visible = false` and appends the clip to `mInitList`. This includes the
   `World_Init_CollisionSolid` clips nested inside `Piece.*` sprites. `_Size` hides itself
   with a frame script.
2. `mArea = (0, 0, mcRoomData._Size._width, mcRoomData._Size._height)`, which is `size`.
   This is the transformed width of `_Size` inside the room, for example
   `640 * 1.0999908 = 704` px. Some rooms are fractional (`1311.95`). `CMap` rounds
   `size / 32` to whole cells. `BitmapData` truncates to whole pixels.
3. `bmFloor.draw(mcRoomData)` draws the room with every init object hidden. That is
   `background`: the top-level children that are neither init objects nor self-hiding,
   with their matrices. Draw each one recursively, and skip any nested character listed in
   `hiddenCharacterIds`.
4. `InitThings` walks `mInitList` in order. Each `CWorld_Init_Piece.Draw()` draws the piece
   into `bmFloor` and `bmDecalMask` with `Matrix(1, 0, 0, 1, mPosition)`. That is
   translation only: the piece's own rotation, scale and color transform are ignored, and
   `BitmapData.draw` ignores the source's own transform. Then it draws `_Cover` into
   `bmCover` at the cover's room position, again translation only. Draw the piece sprite
   at `pieces[].position`, skipping hidden nested characters such as its collision solid,
   in `pieces[]` order. Then draw `coverCharacterId` at `coverPosition` on the cover
   layer. No piece in the 18 rooms is rotated or scaled.

`RoomInitObject = { order, kind, linkage, characterId, instancePath, name?, position, position2, rotationDegrees }`:

* `kind` is the class suffix: `CollisionSolid | Wall | Barrel | Zombie | Devil | Player1 | Player2 | Pickup | Piece`.
* `position` is `mPosition`: `localToGlobal(0, 0)` then `mWorld.globalToLocal`. That is
  the clip origin through the whole nested matrix chain, in room pixels.
* `position2` is `mPosition2 = mPosition + (_width, _height)`, where `_width`/`_height`
  are the clip's transformed bounds in its parent's space.
* `rotationDegrees` is `_rotation = atan2(b, a)` of the clip's own matrix. `CWorld`
  converts it with `Deg2Rad`.
* `instancePath` lists the depths from the room down to the clip.
* `order` is the `mInitList` index. Every frame 0 in this SWF places children in
  ascending depth, so tag order and depth order agree. A clip is registered before its own
  children (pre-order), because AS2 queues a registered clip's constructor before the
  constructors of the children its first frame creates. See
  `docs/porting/deviations.md`.

The domain converts pixels to cells (`/ 32`, `ConvertScreenToCell`) itself.

`RoomPiece = { order, linkage, characterId, position, coverCharacterId, coverPosition }`.
`order` points into `initObjects`. The cover fields are `null` when the piece has no
`_Cover`.

### rooms/index.json

`{ formatVersion, rooms: [{ index, id, file, name, iconFrame, exclusive: { single, coop, deathMatch } }] }`

The order is the select screen's: frame `i` of `LevelIcons_Single` (0-based `iconFrame`)
is `ROOM_Single_{i+1}` (`CScreen_SelectWorld.LoadLevel`). `name` is the static text on that
frame, for example `BOXY`, `BUTTONS`, `MAZEY` ... `BIG ONE`. `exclusive` comes from
`Single_Exclusives`, `Coop_Exclusives` and `DeathMatch_Exclusives`. An exclusive room
shows `mcExclusive` and cannot be started unless `_global.mHostedOnCMG` is set. This is the
only lock state in the game. There is no unlock progression.

### characters/xsi.json

`{ formatVersion, globalScale, setOrder, materials, textureLinkages, sets }`

* The source is the deobfuscated `DoAction` of `DefineSprite_755` (`TMP2639qh3hat`). It is
  found by its `_global.mXSI_Data` marker. It is plain JavaScript: `var mRotations = ...;`
  object literals, then `mItems = new Array(); _global.mXSI_Data = {mItems:mItems}; mItems.push(...)`.
  It runs in a `node:vm` context that has only `_global` and a no-op `trace`. The result
  is copied out with JSON, so numbers round-trip exactly.
* `sets["<groupId>_<animId>"]` (40 sets) is `{ groupId, animId, frameSequence?, renderPartner?, tilt (degrees), light: { mX, mY, mZ }, materials, directions }`.
  `directions[direction][frame] = { Models: { [modelName]: Model } }`, with
  `Model = { Empty?, Shape_vList?, Shape_Material?, Shape_Matrix? (0 or {a,b,c,d,tx,ty}), Shape_Brightness?, Shadow?, PEdge?, Edge?, XSIInfo?: { vPosition: { mX, mY, mZ } } }`.
  The vertex lists are flat `[x0, y0, x1, y1, ...]`. Model key order is the source order.
  `CDrawPrimitive_XSI_DI.Render` visits models with AS2 `for..in`, which is newest-first
  (reverse source order), and gives the n-th visited model plane depth `10000 - n`.
* `setOrder` is the `mItems` push order.
* `materials` is the merged master table (`Register_Materials`). `CDrawPrimitive_XSI_DI`
  iterates `mItems` with AS2 `for..in`, which is newest-first, so the first item's
  definition wins. None of the 23 materials conflict between sets.
* `textureLinkages[linkage] = { characterId | null, usedBy }` lists every `mcLinkID` (a
  movie clip drawn into a `mSize` bitmap and used as a bitmap fill) from the materials and
  from the `SS_*` style sheets in `CDrawPrimitive_XSI_StyleSheet.as`. Nine are not exported
  in the SWF: `Bond_Head_*`, `GIJOE_Head_*` and `Swat_Head_*`. In the original,
  `attachMovie` returns nothing for them and `LoadMaterial` keeps the previously drawn
  bitmap. The pipeline logs a warning for them.

### characters/anim-meta.json

`{ formatVersion, globalScale, sets: { [setId]: { groupId, animId, directionCount, frameCount, sourceFrameCount, frameSequence?, renderPartner?, tilt, anchors } } }`

* `frameCount` is `frameSequence.length` when there is a sequence, otherwise
  `sourceFrameCount`.
* `anchors[direction][sourceFrame]` is `{ Hand_Right?, Hand_Left?, GunPosition_Right? }`
  with `{ x, y, z }` taken from `XSIInfo.vPosition`. These are raw values: multiply by
  `globalScale` (0.35, `CDrawPrimitive_XSI.mGlobalScale`) as `FillXSIInfo` does. A model
  that is `Empty` or has no `XSIInfo` is omitted. The original produces `undefined` there.
  Map a sequence frame through `frameSequence[i]`.

### sounds/index.json

`{ formatVersion, sounds: { [id]: { file, characterId, source: 'export'|'timeline', linkage?, sampleCount, sampleRate, stereo, timelineStarts? } }, registrations: [{ table, key, type, linkage, volume, playback }] }`

* Exported sounds use their linkage as the id (`Weapon.Pistol.Fire.wav`) and
  `<linkage without .wav>.mp3` as the file.
* The five unexported sounds are started by StartSound tags in timelines. They are named
  after the clip that plays them: `Screen_Intro._Logo_CrazyMonkeys.Sound174/175/184` and
  `Screen_Intro._Logo_SeanCooper.Sound192/193`. `timelineStarts` gives the sprite and frame,
  and the same events appear in `symbols.json` `frameSounds`.
* `registrations` mirrors the `RegisterSound` calls in `CSound.as`: table `mSamples` or
  `mAmbience`, key, type, volume factor, and `PlaySound_Positional` or `PlaySound_Normal`.
  Every registration has type `sfx`. Nothing is registered as `music`, so the Music
  option has nothing to stop.

### fonts/index.json

`{ formatVersion, fonts: { [fontId]: { name, bold, italic, file, codePoints } } }`

These are the embedded DefineFont3 glyph sets converted to WOFF by FFDec. `codePoints` is
the font's code table, which is the set of characters available to edit texts with
`useOutlines`.

## Verified facts

* FFDec's XML matrix attributes map as `b = rotateSkew0`, `c = rotateSkew1`, the same as
  the SWF spec and FFDec's own `sprite:svg` export (`matrix(-0.5318, 1.1321, -0.6118, -0.9841, 340.8, 303.0)`
  for the skewed floor splat in ROOM_Single_0001). The arrows of the rotated
  `World_Init_Player2` markers (+90, -90, 180 degrees) point the same way in the FFDec PNG
  as `atan2(b, a)` predicts.
* Library frame bounds match FFDec PNG sizes: `Piece.Wall1` 204.9 x 94.65 (PNG 205 x 95).
  Rooms whose children have filters come out 6 x 6 px larger in FFDec PNGs because of
  filter padding, for example ROOM_Single_0001 721 x 800.65 (PNG 727 x 807).
* All 18 rooms: tag order equals depth order, every collision solid is nested in a piece,
  and no piece is rotated or scaled. Room 1 is 704 x 544.
* All CSound registrations are `sfx`. The intro logo sounds are timeline StartSounds.

## Debug procedure

`npm run extract:debug [ROOM ...]` (`tools/extract/debug/composeRoomSvg.ts`) reads the
generated catalogs and does two things:

* It writes `<room>.svg` into a new `boxhead2play-debug-*` temp dir. The file contains the
  background, the pieces (translation only), the covers at 50 % opacity, dashed collision
  solids, init markers (kind, origin, rotation) and the `size` rectangle, all in room
  space. Open it in a browser, or run `rsvg-convert <room>.svg -o room.png`.
* It exports the room sprites with FFDec `sprite:png` into `png/` and prints the PNG size
  next to the library frame bounds. FFDec renders the init objects visibly (blue collision
  boxes, letter markers), which helps line up positions.

The composite inlines each shape's SVG markup with prefixed ids instead of using
`<image>`. librsvg renders a nested SVG `<image>` wrongly under a skewing transform, and
the floor splats are skewed. Browsers' `drawImage` applies the full affine transform
correctly.

## Known limitations

* Filters, blend modes and color transforms are exported as data only.
* Clip actions (`onClipEvent`, `on(release)` on placements) are flagged (`hasClipActions`)
  but not exported. Their source is in `re/scripts/.../CLIPACTIONRECORD *.as`.
* Edit texts are not rasterized. The UI renders them from `editTexts` and `fonts/`.
* Nested sprite bounds assume frame 0 of the nested sprite.
* Rounding of transformed bounds to twips uses round-to-nearest. Flash's exact fixed-point
  rounding is unverified and can change a room size by 0.05 px.

## Runtime loading failures

The browser loader (`src/adapters/assets/http.ts`) treats three failures as fatal and shows
a specific message on the loading screen:

| Error code | Cause | Message key |
|---|---|---|
| `ASSET_MISSING` | Network error or HTTP error status | `boot.missingAssets` |
| `ASSET_SERVED_AS_PAGE` | The server answered with `text/html`. Vite does this for files added to `public/assets/` after the dev server started (its HTML fallback). | `boot.staleAssets` |
| `ASSET_TIMED_OUT` | A request or SVG decode took longer than `ASSET_REQUEST_TIMEOUT_MS` / `ASSET_DECODE_TIMEOUT_MS` (15 s each) | `boot.assetTimedOut` |

Downloads run 8 at a time (`mapLimited`). After the first failure no further downloads
start, and the shell's error state is sticky (`Shell.showError`), so progress reports from
downloads still in flight cannot overwrite the message. Before this, a failure left the
screen frozen on the last percentage (observed as "Loading graphics… 16%").
