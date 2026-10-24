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
* A running Vite dev server (v8.3) does not serve files that `npm run extract` creates in
  `public/assets/` after it started. It answers them with `index.html` (`text/html`, status
  200). Restart `npm run dev` after re-extracting. Verified 2026-10-23 with
  `morphs/569_0.svg`.

## Verification checklist

Add one line per behavior change: what to do, and the result you expect.

* `npm run extract` -> `public/assets/manifest.json` exists and lists 18 rooms.
* `npm run extract:debug` -> prints composite SVG paths for ROOM_Single_0001/0002 and
  "FFDec PNG 727x807, library frame bounds 721x800.65 (delta 6x6)" for room 1.
* `npm run dev`, choose a room, press W A S D -> player 1 walks. Space fires the pistol, E / Q
  switch weapons.
* `npm test -- test/domain` -> domain suites pass (map, navigation, collision, affects,
  spawning, upgrades, world completion, camera, ambience).
* `npx vitest run test/domain/things` -> creature, weapon, object, effect, input latch and
  factory suites pass, and the integration suite runs 2000 ticks of single, coop and
  deathmatch play on ROOM_Single_0001 (a built-in room when assets are missing) with no NaN
  positions and identical traces for the same seed.
* `npx vitest run test/domain/world/playerSpawns.test.ts` -> 16 players in every room, coop and
  deathmatch, never stand inside a wall; ROOM_Single_0011 has no spawn point at (16, 9).
* Two tabs both named "Player" in one lobby -> the room lists PLAYER and PLAYER #2.
* `npx vitest run test/server` -> a 17th player gets `lobbyFull`; a death match starts with 16
  players at 16 different indices. The lobby room lists at most 11 players, your own line and
  "+N MORE", under "PLAYERS: n/16".
* Zombie next to a player -> the player loses 50 life per attack (also with damage off).
  Devil within 5 cells, facing the player with a clear line -> a fireball for 50.
* `npx vitest run test/domain/map/GameMap.test.ts test/domain/things/creatures/devil.test.ts` ->
  diagonal zombie attacks also hit a player in a side cell; a fireball hurts a player standing
  just across a cell border.
* Shoot a barrel next to another barrel -> two explosions two ticks apart, both
  barrels gone, scorch decals and a `(0, 30)` shake.
* Multiplier x5 -> every player gets the UZI (key 2, 100 rounds). Weapon out of ammo ->
  red `hud.outOfAmmo.<id>` message and the pistol.
* Coop death -> respawn after 4 s + 1 s near the nearest living player with 200 life, empty
  weapons and 5 s of blinking. Single death -> `worldCompleted` with `playerDead`.
* `npm run dev`, PLAY, go to level 1/18 BOXY, click the preview -> the room, the score total
  `000000000000` with `x1`, "Pistol selected!" sliding up, and player 1 blinking for 8 s.
* Let zombies reach the player -> blood decals appear on the floor but never on walls,
  and the life bar above the player shrinks.
* Press TAB -> the upgrade list (keyboard focus does not move) over the running game, no "PAUSED!" (new weapons in green,
  inactive ones faded); zombies keep moving and W A S D still walk; TAB again hides it; click
  QUIT? -> back to the single select-world screen.
* Two browser tabs on `npm run dev`: DEATH MATCH in both, HOST in one, JOIN and the row's JOIN in
  the other, click the level in the host tab -> each tab shows a full 640 x 480 view of its own player and no frags bar;
  TAB -> SCOREBOARD with one row per player (rank and name, kills, deaths), your row green.
  A third tab can join the same death match.
* Search the running game (menus, CONTROLS, lobby, HUD, scoreboard) for "Player 2" -> none;
  a player without a name is shown as "Player".
* SETTINGS -> Screen shake OFF, shoot a barrel -> the view does not shake; Blood OFF -> zombies
  hit by bullets leave no blood, existing blood disappears; ON brings it back.
* Online coop, let a zombie kill a player -> red "<NAME> was killed by a zombie!" at the bottom
  for everyone; deathmatch grenade kill -> red "<KILLER> killed <VICTIM>!" and the frag goes to
  the thrower.
* In a game press Esc -> SETTINGS and QUIT over a light backdrop, the game keeps running;
  SETTINGS -> the graphics/volume window, Esc -> back to the choices; QUIT -> the select-world
  screen (online: the lobby room).
* Switch to another tab while playing single -> on return the game continues where it was,
  with no pause screen and no catch-up burst.
* `npx vitest run test/adapters test/services test/entry test/ui` -> asset mapping,
  render math, XSI plane lists, HUD animation, mixer, input edges, settings migration,
  session routing and loop accounting pass (asset-based suites skip without
  `public/assets`).
* Zombies walking left next to the player -> solid figures: head and body over the arms on the
  far side, no arms or feet showing through the body (like the SWF).
* Fire the rocket launcher (key 8 after unlocking) -> one yellow-white glowing projectile, not
  three separate white dots.
* `npm run dev` in a 1920 x 1080 window -> the canvas is 1440 x 1080 device pixels
  (`resolution` 2.25); menu text, character cards, barrels and characters have smooth edges,
  no 2-pixel steps; barrel outlines stay 1 stage pixel thick.
* Main menu, SETTINGS -> the options window titled SETTINGS with Graphics (SHARP, SMOOTH,
  PIXELATED) and Sound volume (OFF, LOW, MEDIUM, FULL); SMOOTH -> the canvas is 640 x 480 at
  once; OFF -> no sounds; RESET -> SHARP, FULL; kept after a reload (settings `version` 3).
* Hold two movement keys (for example S + D) -> player 1 walks diagonally at the same speed
  as straight (0.16 cells per tick).
* `npm run dev` -> after loading, a fade from black to the main menu: background, BOXHEAD 2PLAY
  title, "SINGLE PLAY", "COOPERATIVE" and "DEATH MATCH" at 50 %. Hover one -> full alpha with
  a jittering drop shadow and a hand cursor.
* SINGLE PLAY -> select world with "Back to menu", OBJECTIVE KILL ZOMBIES, one character card and
  the level preview (no More Games, banners, Sean Cooper text or View Highscores). COOPERATIVE
  or DEATH MATCH -> HOST, JOIN and NAME: PLAYER in the main menu style with "Back to menu" and
  "COOPERATIVE ONLINE · Open games: 0"; HOST -> OBJECTIVE with one character card, no "2" label,
  "PLAYERS: 1. PLAYER · BAMBO (you, host)" and "CLICK TO START GAME". Back to menu -> the online
  menu, then the main menu.
* Lobby room (HOST), open OPTIONS or CONTROLS -> the window covers the player list and the
  options line; nothing draws over it.
* Online menu, click NAME, type "Ann", Enter -> "NAME: ANN", kept after a reload. JOIN -> the
  controls window titled "SELECT A GAME TO JOIN!" with rows like "ANN'S GAME" and "JOIN 1/16".
  With more than 14 games (for example 30 WebSocket clients that each send `hello` and `createLobby`) ->
  "Page 1 of 3", NEXT > and < PREV step through the pages, faded at the ends.
* Character or level arrows -> the next frame with wraparound (BAMBO -> BON, 18/18 -> 1/18),
  kept after a reload; the game uses the chosen characters. Every level starts (no exclusive lock).
* OPTIONS (single play and lobby room) -> the italic info lines under Object collision, Devils
  and Friendly Fire end without "Forfeits hiscore!".
* OPTIONS -> modal window; clicking a value moves the pink highlight and changes the game; RESET
  -> Beginner, Normal, on, on, on, first to 10. CONTROLS -> one centered panel titled
  CONTROLS with the key names (SHOOT/USE: SPACE), no player 2 panel; click a key, press Enter -> "INVALID KEY!" fading back to "PRESS A KEY", press K ->
  `'K'` stored; Escape cancels; RESET restores the defaults.
* `npx vitest run test/ui test/services test/adapters/render/hitTest.test.ts` -> menu rules
  (wraparound, roll-over filters, valid keys, key capture, pointer, transition), option
  mapping, settings v1 -> v2 -> v3 migration, screen flow (including lobby routing), lobby view
  model, online client and online playback pass.
* Run `npm run extract` while `npm run dev` keeps running, then reload -> the loading screen
  says the server returned a web page instead of an asset and to restart the dev server; it
  does not freeze at a percentage. After restarting, the main menu appears.
* Fresh clone, `npm install`, `npm run dev` (Java 8+ on PATH) -> FFDec is downloaded once into
  `.cache/`, assets are extracted, the main menu loads. A second `npm run dev` prints "Game
  assets are up to date." and starts immediately.
* `npx vitest run test/server test/net test/adapters/net` -> hub sessions and resume, lobby
  host rules, a fifth player refused, per-player frames, remote input moving a player 0.16
  cells per tick, late join and leave, game over, the 45 s reconnect grace, control masks and
  the protocol codec pass.
* `npx vitest run test/domain/world test/domain/things` -> four players spawn on four
  different cells, every player gets a 640 px camera, late join takes the lowest free index,
  a deathmatch kill is credited to the shooter, and a coop late joiner gets the unlocked
  weapons.
* Two tabs on `npm run dev`, COOPERATIVE, HOST in tab 1, JOIN in tab 2 (the room lists both names
  and characters, tab 2 says "WAITING FOR ... TO START"), click the level in tab 1 -> both tabs play the same world with one shared score; W A S D
  move only that tab's player; TAB in tab 2 shows the upgrade list there while both players keep
  playing; QUIT? -> tab 2 is back in the room with "You left the match." and "CLICK TO JOIN GAME";
  clicking the level joins the running match again.
* Two tabs in a coop game with names Ann and Bob -> under each player its name in small text;
  your own is green, the other one white.
* Online coop, unlock several weapons quickly -> each "New Weapon" message slides up and
  pushes the older ones up by 19 px; no messages on top of each other.
* Two tabs in a coop game, block one tab for a second (devtools console:
  `const t = performance.now() + 1000; while (performance.now() < t);`)
  -> movement in that tab feels as direct again within half a second (the frame buffer
  catches up to 1 frame instead of keeping 6).
* `npm run build`, then `BOXHEAD_ASSET_DIR=public/assets PORT=8099 npm start` -> one port serves
  the page (`/` 200, `/../package.json` 404) and `ws://localhost:8099/ws`; a match streams 25
  frames per second of about 4 KB.
* Two tabs on `npm run dev`, start a coop game while the guest tab is in the background, switch
  to it and press TAB before any upgrade -> the full upgrade list shows (pistol rows faded).
