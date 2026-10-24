# Deliberate deviations from the original

| Area | Original | Port | Reason |
|---|---|---|---|
| Randomness | `random(n)`, `Math.random()` | Injected `Rng` | Deterministic tests and replays. |
| High scores | Submitted to seantcooper.com (`CHighscore_Submit`) | Removed | The service is gone; see ADR 0003. |
| Analytics | `CTracker` | Removed | See ADR 0003. |
| Player names | none | Online: the name under each player, green for the local player | Owner request: tell players apart. |
| Controls window | Two key panels (player 2 covered in single play), "PLAYER 1 CONTROLS:", Space named `' '` | One centered panel titled CONTROLS, Space named SPACE | No local second player (ADR 0005); owner request. |
| Player spawn markers in walls | `Player2` markers are used as placed (ROOM_Single_0011 has one at (16.45, 9.54) inside a wall block; local play rarely picked it) | Markers in solid or ledge cells are dropped at load; the open-cell search may cross walls to escape | Online coop and late joins spawned players inside that wall. |
| Default keys | Arrows, `/` (and Space), `.`, `,` | W, A, S, D, Space, E, Q | Owner request. |
| Render resolution | Vector menus at the window size; the world is a 640 x 480 bitmap (`CWorld.bmDraw`) | Every surface at the screen's resolution by default (`sharp`); `smooth` and `pixelated` draw at 640 x 480 | Owner request: sharp graphics on large screens. See ADR 0006. The room planes use their own resolution (ROOM DETAIL; LOW is the original's 1), see ADR 0008. |
| Init object order | `mInitList` order is the order of AS2 constructors while the room is attached | `rooms/*.json` `initObjects` in pre-order: tag order (which equals depth order in every room), a clip before its nested children | AS2 queues a registered clip's constructor before the constructors of the children its first frame creates. The only nested init objects are collision solids inside pieces, so this order affects no gameplay. |
| XSI master materials | `Register_Materials` per `mItems` entry, iterated with AS2 `for..in` (newest-first) | `characters/xsi.json` `materials` merged from the last item to the first, so the first item wins | Same result as the original. No material differs between sets today. |
| Navigation timing | `getTimer()` session ids, 2000 ms freshness, 3 ms budget per update with a `continue` state | Update counter as session id, freshness `2 * ticksPerSecond` updates, up to 5 whole rings per update | Determinism. The distances and the ring order are the same. Only the part-ring time slicing is gone. |
| Line hit points | `CMap_Cell.LineIntersection*` return the shared statics `xPOI`/`yPOI`, which later cells in the same scan overwrite (a thing test writes `xPOI` before checking the distance) | Each hit has its own point | Bug fix. The original could stop a bullet at a point that belongs to another cell. |
| Player deletion | `DeleteThing_Player` disposes the player at once and again on the next `Process` | `ThingCollection.deleteThing` removes the player from the player list at once and disposes once on the next pass | Same observable result, no double dispose. |
| Weapon unlock calls | `CUpgrades.AddUpgrade` calls `NewWeapon(value)` on every player for every value that is not `true`, including level numbers | Only weapon-unlock entries call `newWeapon` | The other calls were no-ops (unknown weapon names). |
| Upgrade text | "UZI+: Infinate Range" | "UZI+: Infinite Range" | Spelling. The identifiers `InfinateAmmo`/`InfinateRange` are kept. |
| HUD message lifetime | 3000 ms of wall clock | 3 seconds of ticks (`3 * ticksPerSecond`) | Determinism. The fade animation belongs to the renderer. |
| Spawn points outside the map | Stored with an `undefined` cell | Dropped | The original would fail at the first use. No room has one. |
| Zombie/devil spawn point angle | `undefined` | `Angle(0)` | Never read. |
| `ThingFlag.Drawn` | Set by `CMap.Draw` | Not set | Never read. Keeps drawing read-only. |
| `CThings` bookkeeping | Time slice counters (slow, medium, fast) advanced every pass, and a counter of creatures killed by an invalid knockback position | Not ported | Never read. |
| `MoveInDirection2` | Direction arithmetic without wrapping | Wraps with `& 7` | The function has no caller. |
| Quit | Only the pause screen button sets `quit` (the QUIT? button on the upgrade list in the port) | `TickInput.quitRequested` at any time | The UI decides when the request can be made. |
| Thing ids | Static `CThing.mAllocate_ID`, renewed per world | `ThingIds` per world | Same numbers, no global state. |
| Creatures without a target | Zombies and devils read `mTarget_Player.mPosition` even when no player exists and aim at cell (0, 0) | They wait a second (`wait`) | The original only reached this after the game had ended. |
| Key edges | `CInput` latched presses and releases from keyboard events. `Renew()` on a held key let the next key event (usually auto-repeat) latch a new press | `LatchedControl.sync` rebuilds the latches from the per-tick `ControlState`. A key still held after `renew()` latches a new press on the next tick | No keyboard events in the domain. The difference is the auto-repeat delay. |
| Grenade hold time | `getTimer()` milliseconds between press and release | Ticks between press and release divided by `ticksPerSecond` | Determinism. Same value at a steady frame rate. |
| Explosion brightness | `mWorld.mBrightness = 1` twice per explosion | One `flashBrightness(1)` | Same state, one event. |
| Screen shake and brightness flash | `CWorld.Shake` and `mWorld.mBrightness` are world-wide: every explosion shakes and flashes the screen, wherever it is in the room | One `ScreenEffects` per camera; an explosion shakes and flashes only cameras whose view (plus a 112 px margin) contains it. Single play too: an explosion off screen no longer shakes or flashes | Owner request: with up to 16 cameras, every explosion anywhere shook every player. See `docs/domain/world-lifecycle.md`. |
| Weapon and pickup texts | Literal strings built with `+` (`mName + " selected!"`, `"Picked up " + mName`). `AddMessage_Info` ignored its player index | `TextKey`s per weapon (`weapon.<id>.name`, `hud.weaponSelected.<id>`, `hud.outOfAmmo.<id>`, `hud.pickedUp.<id>`, `hud.lifeUp`). The event carries the player index | Text lives in `en.json`. The renderer may ignore the index to look like the original. |
| HUD short names of unlisted weapons | The Devastator and the Smart Bomb have no `mShortName` (the HUD would show `undefined`) | Short name = full name | Both weapons are unreachable in the game. |
| D-laser drawing | `CThing_Shot_DLaser.Draw` used room coordinates without the camera offset | Same `line` descriptor as the other shots | Rendering bug in an unused class. |
| Devil hand anchors | `FillXSIInfo` scaled anchors with the global scale at load time | `AnimationCatalog.modelScale` (0.35) | The devil sets have no hand anchors in the extracted data, so the fallback position is always used, as in the original. |
| Player infinite-life cheat | `_global.mInfinateLife` limited the player's affects to line of sight | Not ported | Debug switch, never set by the game. |
| XSI frame rendering | `InitCleanUp` blocks the world start until every character frame is rendered | Lazy rendering per frame plus idle-time prewarming in the same order | Faster start. See ADR 0004. |
| Missing head textures | `Bond_Head_*`, `GIJOE_Head_*`, `Swat_Head_*` are not exported; the shared material bitmap keeps the last style sheet's head | The master material's linkage (`Head_*_MC`) | Deterministic. That is the bitmap the original most likely showed. |
| `LoadAnimation` frame reuse | The frame variable is not reset in the frame loop, which would reuse frame 0's bitmap | Frame `i` uses source frame `frameSequence[i]` | The game visibly animates, so the decompiled register reuse is an artifact. |
| Filters | Flash filters | Glow, gradient glow (outer), drop shadow, blur and color matrix approximated per pixel; bevel, gradient bevel and inner filters skipped | Canvas has no equivalent. See `docs/runtime/rendering.md`. |
| Diagonal player speed | `State_PlayerControl` scales `(±1, ±1)` by `mSpeed`, so diagonal walking is √2 (about 1.41×) faster | The input vector is normalized to `speed` (0.16 cells per tick in every direction); sliding along a wall while holding a diagonal is correspondingly slower (0.16 × cos 45°) | Owner-requested bug fix. |
| Copy positions | `copyPixels` converts the destination point to whole pixels | `floor` | Flash's exact rounding is unverified. |
| Stale stage pixels | `bmDraw` is not cleared in single and coop; areas outside the floor keep old pixels | Cleared to black before the floor copy | Only visible in rooms smaller than the view. |
| HUD message fade | `getTimer()` age of each message | Age from ticks (`(tick - messageTick) / ticksPerSecond`) | Determinism, and it matches the domain's 3 s tick lifetime. |
| Exclusive rooms | `mcExclusive` shown and the level locked unless `_global.mHostedOnCMG` | `mcExclusive` always hidden, every level playable | Frame 1 sets `mHostedOnCMG` once the date is more than 180 days after 2007-04-23, so the original unlocks everything today. See `docs/runtime/screens.md`. |
| Debrief screens | `State_Debrief`, `State_Debrief_Winner` | Every completion returns to select world in the mode played (`mReturn_SelectWorld`); the result is logged (`screen.game_finished`) | Not ported yet. |
| Intro and loading screens | `Screen_Intro` (logos), `Screen_LoadingWorld` | Boot opens the main menu; `GameScreen` starts the world directly | Not ported yet. |
| Main menu buttons | SINGLE PLAY, COOPERATIVE, DEATH MATCH, INSTRUCTIONS | SINGLE PLAY (local), COOPERATIVE and DEATH MATCH (online lobby), SETTINGS (graphics quality, sound volume) in the INSTRUCTIONS slot | INSTRUCTIONS was an external link. See ADR 0005 and ADR 0006. |
| Local two players | One keyboard, two key sets, two character cards, a shared coop camera, a 480 x 480 split screen in deathmatch with a switch-sides button | Removed. Coop and deathmatch are played online, one player per browser, each with a full 640 x 480 camera and the player 1 key set | Owner request. See ADR 0005 and `docs/runtime/online.md`. |
| Player count | 1 or 2 players | 1 to 16 (`MAX_PLAYERS`), coop and death match, players can join and leave a running online world | Online lobbies. |
| Coop leash | A coop player could not walk more than 19 x 13 cells from the live partner (`keepDistance`) | Removed | It kept both players on one shared screen. |
| Coop camera | The average of both players (`(previous + p) / 2`) | Each player's camera follows that player | One screen per player. |
| Weapon number keys and Space fire | Only with one player (`mTotalPlayerCount == 1`) | Always | Every player has a keyboard of their own. |
| Deathmatch score | A death counts as the other player's kill; first to N wins (`player1Wins` / `player2Wins`) | Frags go only to the player who dealt the killing hit (`lastAttackerIndex`); a death by oneself, a zombie or a devil gives nobody a frag; `playerWon` with `winnerIndex` | Needed for more than two players. Owner request: other players must not score from a death they did not cause. |
| Late joiners | none | A player who joins a running coop world gets the weapons unlocked so far; in deathmatch the inventory is reset like a respawn | Online lobbies. |
| Pause | P and a hidden page paused the world and showed "PAUSED!" with the upgrade list and QUIT? | No pause in any mode. `` ` `` (backquote, instead of P) toggles the upgrade list and QUIT? over the running game (the "PAUSED!" title, depth 14 of `HUD.Paused`, is hidden); the player keeps control | Owner request: players must not be able to pause, also in single play. A hidden page or a phone held upright still freezes single play, without a pause screen (`docs/runtime/loop.md`, "Visibility and portrait"). |
| Debrief screens (online) | `State_Debrief_Winner` | The lobby room shows the winner or the score | Not ported; same as local. |
| Online menus | none | The main menu's button slots become HOST and JOIN (NAME is a small button in the main menu's bottom-left corner, JOIN BY CODE in the bottom-right one); the CONTROLS window becomes the join list (rows `<GAME> n/max:` and `JOIN`); the select-world screen of the mode is the lobby room, where clicking the level starts the match | Owner request: online screens in the game's own style. |
| External links | Instructions, trailer, More Games, Sean Cooper site, four game banners, View Highscores | Removed | The links and the score server are gone. |
| Menu frame rate | `onEnterFrame` at 50 fps, screen logic at 25/s | Menu screens tick at 50/s, screen logic (transitions) every second tick | Same timing; documented in `docs/runtime/screens.md`. |
| Stored menu indexes | `mcGotoFrame` wraps the shown frame, `LoadLevel` uses the unwrapped stored index | Both use the wrapped index | An out-of-range saved index would have loaded a missing room. |
| Key prompt alpha | After an invalid key, a valid key closes the prompt and `mcPressAKey` can keep a partial alpha for the next prompt | Each prompt starts fully visible | Bug fix. |
| Modal windows | Blocking by `mcLock.onPress` and `mc2PlayerCover.onPress` | Same blockers, hit-tested on their bounds | Flash tests clip shapes; both blockers are full rectangles. |
| In-game menu | Esc does nothing in game | Esc opens SETTINGS / QUIT over the running game (see `docs/runtime/screens.md`) | Owner request: change graphics and volume, and quit, without the upgrade list. |
| Deathmatch HUD | `Hud_PlayerFrags` shows both players' frags at the top | No frags at the top; `` ` `` shows a scoreboard of every player instead of the upgrade list | Owner request; the two-panel bar does not fit more than two players. |
| Zombie attack cells | The attack starts when the cell ahead or, on a diagonal, either side cell holds a player, but only the cell ahead is hit | On a diagonal the side cells that hold a player are hit too (`MapCell.cellsToward`) | A player near a cell corner was never hurt by a zombie next to it. |
| Fireball hits | The fireball explodes on touching a thing but only affects the cells within its 0.25 radius | It also affects the things it touched (`MapCollide.lastTouched`) | A player just across a cell border took no damage. |
| Option info lines | Collisions, Devils and Friendly Fire end with "Forfeits hiscore!" | The original static text is clipped before "Forfeits hiscore!" (`clipBefore`, glyph positions from the catalog) | There is no high score server. |
| Kill messages | No message when a player dies | A red HUD message names the killer (player name, zombie or devil) and the victim | Owner request. |
| Explosion kills | `mLastAttacker` is the affect owner, which is the shot for grenades, rockets and mines | The root of the owner's parent chain (the player who fired) | Deathmatch frags and kill messages credit the right player. |
| Respawn countdown | A dead player waits with no indication | "RESPAWN IN n" in the middle of the view until the respawn | Owner request. |
| Enemies per player | Level counts are the same for one or two players | +50 % of the level's zombies and devils per player from the second, live caps up to 120 zombies and 20 devils | Owner request: up to 16 players. See `docs/domain/spawning-and-upgrades.md`. |
| Frame rate | Flash drew once per 25 fps logic frame | Logic stays at 25 ticks/s; drawing follows the display, capped by SETTINGS (30, 60, 120 or DISPLAY) | Owner request. The cap only skips `present`; ticks, input and networking are unchanged. |
| Player spawns | Player 1 on the `Player1` marker; others and respawns on the closest (coop) or farthest (single, deathmatch) player marker | Every mode: the best of 32 random free floor cells reachable from the markers, preferring cells 5 or more from zombie and devil spawn points; the best is the one furthest from the nearest living zombie, devil or spawn point. Other players do not count | Owner request: 16 players do not fit on two markers; being close to other players is fine, being close to zombies is not. See `docs/domain/spawning-and-upgrades.md`. |
| Respawn delay | 4 s dead + 25 ticks (`respawn`), 5 s in total | 4 s dead + 148 ticks, so "RESPAWN IN 10" counts down from 10 | Owner request. Single play still ends after the 4 s corpse. |
| Ping display | none | Online matches show the round-trip time in the top-right corner, colored green, yellow, orange or red; SETTINGS has a Ping row (default ON) | Owner request: see your own connection quality. |
| Mobile browsers | Flash ran on desktops only | Landscape full screen on touch, a rotate screen in portrait, a Home Screen web app for iPhone, on-screen stick, Fire, weapon, menu and list buttons, and the phone keyboard for NAME and JOIN BY CODE (`docs/runtime/mobile.md`) | Owner request: play on phones. |
| Join messages | none | A player entering a running online match shows a yellow "<NAME> joined the game!" message | Owner request: see who connects, like the kill messages. |
| Asset service worker | none (Flash loaded one SWF) | Production builds cache the content-versioned assets in a service worker, so a refresh needs no asset requests in any browser, Safari included (`docs/runtime/http-caching.md`) | Owner report: refreshes kept transferring the assets. |
| Player list | none | Holding TAB in an online match shows every player with alive/dead/offline status, respawn countdown, life and latency (`docs/runtime/online.md`) | Owner request. |
| Menu hit areas | Shape-accurate `hitTest` of clips and button hit states | Bounds of the button `hitTest` records or of the clip, tested in local space | All menu hit shapes are rectangles or covered by `_ClickArea` rectangles. |
| Transition shadow | `DropShadowFilter()` on the incoming 640 x 480 bitmap | Not drawn | It falls outside the stage. |
| SVG drawing | n/a | SVGs are loaded with `preserveAspectRatio="none"` | Firefox letterboxes SVG images under non-uniform scales. |

## Processing order (AS2 `for..in`)

Not a deviation, but a decision about undefined order. AVM1 enumerates object properties
newest first and takes a snapshot of the keys before the loop. The port does this:

* `ThingCollection.process` processes things in reverse insertion order. Things added
  during the pass wait for the next tick.
* Online player indexes follow lobby member order at match start (the host is 0); late
  joiners take the lowest free index. Players are processed newest first, so a late
  joiner acts before the players who started.
* Object literals are the exception. `ActionInitObject` pops the name/value pairs off the
  stack, so the last pair in the source is set first and the first pair is the newest
  property: `for..in` over a literal visits its keys in source order. This decides the
  XSI model plane order (`literalKeysBottomToTop`). Arrays from `ActionInitArray` keep
  index order and are visited from the last index.
* Cell occupants (`MapCell.newestFirst`), players (`ThingCollection.players`) and area
  cell lists (`GameMap.cellsInArea`, reverse scan order) are read newest first.
* `CThing_Creature.ProcessAffects` walks its affect array with `for..in`, which is reverse
  index order. See `affectorsInProcessingOrder`.
* Draw buckets in `CMap.Draw` are arrays iterated with `for..in`, so the last thing pushed
  into a bucket draws first.
* The player's number keys are read over `mWeapons` with `for..in` (railgun first, pistol
  last) and the last released key wins. `WeaponInventory` slots are read in reverse.
* `RandomPickup` builds its chance list over `mWeapons` with `for..in`, so the list (and
  which weapon a roll picks) runs from the railgun down to the UZI, then life.
* `CThing_Object_Barrel` and `CThing_Object_Wall` consume their affect queues newest first.

## Kept quirks

These look like bugs but are kept because they shape gameplay:

* The flood fill gives the player's cell and its four neighbours distance 0.
* Upgrade tables, the start multiplier timers and the devil minimum spawn rate use 25
  ticks/s at any game speed.
* Fireballs damage players even when the damage option is off.
* Ambience slot 0 is silent and ambience sample 4 never plays.
* No "LEVEL 1" message is shown at the start (the HUD did not exist yet when the first level was set).
* Zombie and devil corpses keep the thing counters up until they fade out, which delays the next level.
* A dead or respawning player still sets `CollideFlag.Player` on its cell every tick:
  zombies keep attacking the corpse cell, deathmatch mines trigger on it, and the corpse
  blocks its own spawn marker for the respawn.
* Releasing a reservation (`&= ~Creature`) also clears another creature's reservation of the
  same cell.
* Every queued hit re-enters the hit state, so two hits in one tick splat blood, pick a hit
  animation and play the hit sound twice.
* Zombie attacks hurt players even when the damage option is off.
* The devil's line-of-sight test compares class ids, so the other player in the way counts
  as a clear shot. Objects do not block the line (they lack `PlayerLineOfSight`), so a
  devil throws player fireballs through fake walls when the player is in range.
* Any affect wakes a wall into its affect step, even before its init or while it waits for a
  player to leave the cell. Such a wall never becomes collidable. A destroyed wall sets
  `Collidable` (instead of clearing it) while it fades.
* The pistol fires with a fixed range of 8 instead of its `range` (no pistol range upgrade
  exists).
* A pickup is used up even when `RandomPickup` finds nothing to give.
* `CThing_Shot_Laser` never deletes itself (`mLife` is never set). No weapon fires it.
