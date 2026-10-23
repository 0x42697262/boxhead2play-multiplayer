# Working agreement

Read `docs/architecture.md` first. The guidelines below are the project-specific
application of the team architecture rules.

## Hard rules

1. **No explanatory comments in code.** Use names, small functions and small types. Put the
   *why* in `docs/` (one file per topic) or an ADR in `docs/adr/`. Allowed: tool directives
   whose reason is documented in `docs/`, and JSDoc types where TypeScript cannot express
   them.
2. **No magic values.** Numbers, durations, limits, flags, asset ids, sound ids and strings live
   in one named place: `tuning.ts` per domain area for fixed game numbers, `as const` objects
   with derived union types for enums, `src/text/locales/en.json` for user-facing text,
   `src/text/logEvents.ts` for log event names, `src/text/errors.ts` for error codes. `0`, `1`,
   `true`, `null` and `''` are fine where obvious.
3. **Config is validated at boot.** Only `src/config/env.ts` reads `import.meta.env`. Everything
   else receives the frozen `Settings` object.
4. **Everything that persists is versioned.** Saved settings carry `version`. Generated asset
   catalogs carry `formatVersion`. Readers accept or migrate old versions.
5. **The domain is pure.** `src/domain/**` must not import adapters/services/ui/entry, touch DOM
   globals, read the clock or call `Math.random`. ESLint enforces this.

## Porting rules

* The decompiled ActionScript in `re/scripts/__Packages/` is the specification. Keep the
  original numbers and algorithms. When you change behavior deliberately (bug fix, removed
  feature), record it in `docs/porting/deviations.md`.
* Map each original class to one TypeScript module with an idiomatic name. Record the
  mapping in `docs/porting/class-map.md` (for example `CThing_Creature_Zombie` ->
  `src/domain/things/creatures/Zombie.ts`).
* Replace `random(n)` with `rng.int(n)` and `Math.random()` with `rng.next()`.
* Replace dynamic `SetState("State_X")` string dispatch with a typed state union and a
  handler map. Do not use `this[name]()`.
* AS2 `for..in` iterates newest-first. Where processing order matters for gameplay, document
  the order you chose in `docs/porting/deviations.md`.
* `x & 0xFFFFFF` on a position means "truncate to cell index". Use `Math.trunc` (or
  `Position.cellX` / `cellY`).

## Tooling

* `npm run ci` (lint, typecheck, test) must pass with zero warnings.
* TypeScript strict mode, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
* Tests: `test/` mirrors `src/`. Domain rules get fast unit tests without mocks. Services
  get tests with in-memory fakes. Use `SequenceRng` or `SeededRng` for deterministic tests.
* Relative imports include the `.ts` extension.
* pi-lsp (`npm:@spences10/pi-lsp`) uses the project-local `typescript-language-server`
  dev dependency. Check changed `.ts` files with `lsp_diagnostics_many` before reporting
  completion. Use `lsp_hover`, `lsp_definition` and `lsp_references` for type and symbol
  questions.
* Use American English everywhere.

## Confirmed facts

* JPEXS FFDec 26.4.0 deobfuscates this SWF's AS2 with
  `-config autoDeobfuscate=1,as12DeobfuscatorExecutionLimit=1000000 -export script`. Without
  it, the code is control-flow flattened and uses unresolved `§§constant(n)` pool references.
  Verified 2026-10-22.
* FFDec needs `-Djava.awt.headless=true` for sprite/frame export on a machine without X.
* The SWF is Flash 8, 640x480 stage. Logic runs at 25 ticks/s (`CMain.mFPS`).
* Character art is not bitmap data. It is pre-projected vector polygons per rotation and
  frame (`DefineSprite_755` DoAction, `mItems`), rasterized at runtime with materials from
  style sheets (`CDrawPrimitive_XSI_StyleSheet`).
* FFDec `-swf2xml` (XML export major version 4) matrix attributes map as `a = scaleX`,
  `b = rotateSkew0`, `c = rotateSkew1`, `d = scaleY`, translate in twips. Flash `_rotation`
  is `atan2(b, a)`. Checked against FFDec's sprite SVG/PNG of ROOM_Single_0001 (skewed
  floor splat, Player2 markers at +90/-90/180 degrees). Verified 2026-10-22.
* `-selectid` does not restrict `-export script`. Every script is exported (about 15 s).
* Rooms: every frame 0 places children in ascending depth. Every
  `World_Init_CollisionSolid` is nested in a `Piece.*` sprite. No piece is rotated or
  scaled. `_Size` (sprite 98) hides itself with the frame script `_visible = false;`.
  ROOM_Single_0001 is 704x544 px.
* Sounds: `CSound` registers only `sfx`, and nothing as `music`. The only unexported
  sounds (174, 175, 184, 192, 193) are StartSound tags in the intro logo clips
  `_Logo_CrazyMonkeys` (sprite 186) and `_Logo_SeanCooper` (sprite 194).
* XSI data: 40 animation sets, and the 23 materials never conflict between sets. The style
  sheet texture linkages `Bond_Head_*`, `GIJOE_Head_*` and `Swat_Head_*` are not exported
  in the SWF.
* librsvg (`rsvg-convert`) renders a nested SVG `<image>` wrongly under a skewing
  transform. Inline the SVG markup for debug composites.

## Verification checklist

Add one line per behavior change: what to do, and the result you expect.

* `npm run extract` -> `public/assets/manifest.json` exists and lists 18 rooms.
* `npm run extract:debug` -> prints composite SVG paths for ROOM_Single_0001/0002 and
  "FFDec PNG 727x807, library frame bounds 721x800.65 (delta 6x6)" for room 1.
* `npm run dev`, choose a room, press arrows -> player 1 walks. `/` fires the pistol.
* `npm test -- test/domain` -> domain suites pass (map, navigation, collision, affects,
  spawning, upgrades, world completion, camera, ambience).
* `npx vitest run test/domain/things` -> creature, weapon, object, effect, input latch and
  factory suites pass, and the integration suite runs 2000 ticks of single, coop and
  deathmatch play on ROOM_Single_0001 (a built-in room when assets are missing) with no NaN
  positions and identical traces for the same seed.
* Zombie next to a player -> the player loses 50 life per attack (also with damage off).
  Devil within 5 cells, facing the player with a clear line -> a fireball for 50.
* Shoot a barrel next to another barrel -> two explosions two ticks apart, both
  barrels gone, scorch decals and a `(0, 30)` shake.
* Multiplier x5 -> every player gets the UZI (key 2, 100 rounds). Weapon out of ammo ->
  red `hud.outOfAmmo.<id>` message and the pistol.
* Coop death -> respawn after 4 s + 1 s near the other player with 200 life, empty
  weapons and 5 s of blinking. Single death -> `worldCompleted` with `playerDead`.
* `npm run dev`, pick BOXY single player, Start -> the room, the score total `000000000000`
  with `x1`, "Pistol selected!" sliding up, and player 1 blinking for 8 s.
* Let zombies reach the player -> blood decals appear on the floor but never on walls,
  and the life bar above the player shrinks.
* Press P -> "PAUSED!" with the upgrade list (new weapons in green, inactive ones faded);
  click QUIT? -> back to the picker with "You quit." and the score.
* Pick deathmatch -> two 480 px views scaled side by side with 80 px bars, "Player 2 00"
  on the left (view side 1); clicking the arrows at the bottom swaps the views.
* Switch to another tab while playing -> the game is paused on return.
* `npx vitest run test/adapters test/services test/entry test/ui` -> asset mapping,
  render math, XSI plane lists, HUD animation, mixer, input edges, settings migration,
  session routing and loop accounting pass (asset-based suites skip without
  `public/assets`).

