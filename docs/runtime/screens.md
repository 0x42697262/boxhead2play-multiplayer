# Menu screens

Source: `Screen/CScreen.as`, `CScreen_Main.as`, `CScreen_SelectWorld.as`,
`CScreen_Transition.as`, `CScreen_Collection.as`, `CMain.as` (`State_*`), `CInput.as`
(`Setup_ValidKeys`). Port: `src/ui/screens/menu/`, `src/services/ScreenFlow.ts`,
`src/services/menuSettings.ts`, `src/adapters/input/validKeys.ts`,
`src/adapters/render/menu/LayeredStage.ts`.

## Flow

```
boot -> main menu -> select world (mode) -> game -> select world (same mode)
            ^               |
            +---- back -----+
```

| Original state | Port |
|---|---|
| `State_Intro` (`Screen_Intro`, logo clips) | Not ported. Boot goes straight to the main menu. |
| `State_Main` (`Screen_Main`) | `MainMenuScreen` |
| `State_SelectWorld_Single/Coop/DeathMatch` | `SelectWorldScreen` with a `GameMode`; only Single and DeathMatch are reachable |
| `State_LoadWorld`, `State_LoadingWorld` (`Screen_LoadingWorld`) | Not ported. `GameScreen` starts the world directly. |
| `State_RunWorld` | `GameScreen` / `GameSession` |
| `State_Debrief`, `State_Debrief_Winner` | Not ported. Every completion returns to select world in the mode that was played (`mReturn_SelectWorld`). |

`ScreenFlow` keeps the select-world mode (`mReturn_SelectWorld`). A room that cannot be
created also returns there, like the original `error` completion. `CScreen.GoBack`
(`_Icon_Back.onPress`) requests the main menu.

## Main menu (`Screen_Main`)

Only these parts of sprite 253 are drawn:

* the background (depth 1, sprite 198) and the title (depth 82, sprite 10, the BOXHEAD 2PLAY
  logo with the characters, checked visually);
* **PLAY** in the `mcSinglePlay` slot (depth 8);
* **DEATH MATCH** (`mcDeathPlay`) moved to depth 10 with `mcCoopPlay`'s matrix, so the two
  buttons stack with the original spacing.

Removed: `mcCoopPlay`, `mcInstructions` (external URL), button 203 (a "view the trailer"
YouTube link), `_IconMoreGames`, `_STC` ("A SEAN COOPER GAME" link), the four game
banners (depths 60, 66, 70, 75, all external links) and `_Size`.

PLAY merges SINGLE PLAY and COOPERATIVE because LAN multiplayer is planned instead of
local co-op. Local co-op stays in the domain and services (`GameMode.Coop`,
`SubScreen_Coop`, `CScreen_SelectWorld` coop setup in `selectWorldLayout`), but no menu
entry leads to it for now. No networking exists.

### The PLAY label

The label is the second word of the original static text 206 "SINGLE PLAY" (Arial
Rounded MT Bold), not a substitute font. The extractor writes each glyph's pen position
and advance into `symbols.json` (`texts[id].glyphs`, see `docs/assets/pipeline.md`).
`labelWord.wordCut` splits the glyphs on spaces and returns:

* `clip`: from the end of the previous word's advance (the start of the space) to the
  text bounds' right edge, over the full text height, in text-local pixels;
* `offsetX`: the label's center minus the word's center, both measured over glyph
  advances (`83.6 .. 156.3` and `127.95 .. 156.3` for "SINGLE PLAY", so `-22.175`).

`MainMenuScreen` attaches a copy of the text item, shifted by `offsetX` in its own space,
under the synthetic instance name `playLabelWord` and clips it with `ChildOverride.clip`.
The word index (`PLAY_LABEL_WORD_INDEX = 1`) lives in `src/ui/screens/menu/tuning.ts`.
Without glyph data (an older catalog) the full "SINGLE PLAY" label is drawn.

### Hover (`Register_Button`)

* `_Contents._alpha` is 50 normally and 100 while the pointer is over the button.
* While hovered, every frame sets
  `[DropShadowFilter(rng.next() * 3, rng.int(360)), BlurFilter(rng.next() * 2, rng.next() * 2)]`
  on `_Contents` with Flash defaults (black, alpha 1, blur 4 x 4, strength 1, quality 1).
  The random draws keep the original order (distance, angle, blur x, blur y) and use an
  injected `Rng` (`rollOver.ts`).
* As in Flash, the effect starts on the first frame after the roll-over (`onEnterFrame`).
* Release plays `Click` and opens select world in `Single` (PLAY) or `DeathMatch`.
* The renderer approximates a blur below 2 px as no blur (box radius `floor(blur / 2)`),
  so only the jittering drop shadow is visible.

### Menu tick rate

The SWF runs `onEnterFrame` at 50 fps (`symbols.json` `stage.frameRate`), while
`CMain.Process` only advances screen logic at 25 ticks/s. Everything visible on these
menus is frame driven (the hover jitter, the 8-frame "PRESS A KEY" blink, the invalid
key fade), so menu screens tick at **50/s** (`MENU_TICKS_PER_SECOND`). The 25/s screen
logic (`CScreen_Transition` steps) runs every second tick (`SCREEN_PROCESS_TICKS = 2`).

## Select world (`Screen_SelectWorld` + `SubScreen_<mode>`)

Composition, as `CScreen_SelectWorld` builds it:

* `_SubScreen_Container` is replaced by `SubScreen_<mode>` with an identity matrix
  (`attachMovie` at the container's depth).
* `LevelIcons_Single` is attached to `mcLevel_Selection` at the next free depth (7), takes
  `_Shadow.filters`, and `_Shadow` is hidden.
* `_Game_Options._Selected`, `_Game_Controls._Selected` and the windows' Close/Reset
  `_Selected` are hidden (`RegisterButton_OnRelease`).

Removed: `_IconMoreGames`, `_STC`, the four banners (depths 50, 56, 60, 65) and
`_ViewHighScore` (the score server is gone; see ADR 0003). "Back to menu" stays.

| Element | Behavior |
|---|---|
| `_Icon_Back` | On press: `Click`, back to the main menu. |
| `mcPlayerN_Character.bLeft/bRight` | `mcGotoFrame(mcCharacter, -1/+1)` with wraparound over the 4 frames, `Click2`, stored in `settings.characters[N - 1]`. Single shows player 1, DeathMatch players 1 and 2. |
| `mcLevel_Selection.bLeft/bRight` | Wraparound over the 18 `LevelIcons_Single` frames, `Click2`, stored per mode in `settings.levelIndex`. The counter ("9/18") and the name are static texts on each frame. |
| `_mcLevelIcons._Button` | `Click`, starts the room whose `iconFrame` is the shown frame (`ROOM_Single_<index + 1>`). |
| `_Game_Options` | Opens `mcWindow_Options`. |
| `_Game_Controls` | Opens `mcWindow_Controls`. |

Buttons render their `over` and `down` records while hovered or pressed (Flash
`SimpleButton` states), and the cursor is a hand over anything with a handler, except the
`mcLock` and `mc2PlayerCover` blockers (`useHandCursor = false`).

A stored index outside the frame range shows `mcGotoFrame`'s wrapped frame, and starting
the game uses that same wrapped index (the original would have loaded the unwrapped
`ROOM_Single_<n>`).

### Exclusive levels

`ChangeLevel` shows `mcExclusive` and refuses to start a level marked in
`<Mode>_Exclusives` only when `_global.mHostedOnCMG` is false. Frame 1 of the root
timeline sets `mHostedOnCMG = true` once the date is more than 180 days after 2007-04-23,
so the original has unlocked every level since late 2007. The port therefore always hides
`mcExclusive` and lets every level start. `rooms/index.json` still records the flags.

### Options window (`WindowOptions_Setup`)

Six groups bound to `SettingsService` through `menuSettings.ts`:

| Group | Buttons | Setting |
|---|---|---|
| Difficulty | `_Level_Beginner/Intermediate/Expert/Nightmare` | `difficulty` 0..3 |
| Game speed | `_Speed_Slow/Normal/Fast` | `gameSpeed` 0..2 |
| Devils | `_Devils_Off/On` | `devilsActive` |
| Object collision | `_Collide_Off/On` | `collisionsActive` |
| Friendly fire | `_Damage_Off/On` | `damageActive` |
| Number of games | `_Game1..4` | `gameAmount` 0..3 |

`RegisterButton_SetGroup` shows a button's `_Selected` clip (the pink highlight) when the
stored value equals the button's value; there is no frame change. On/off options store
the legacy `0`/`1` as booleans. Reset applies `ResetOptions` (Beginner, Normal, devils,
collisions and damage on, first to 10). Every click plays `Click2`. The window's `mcLock`
covers the stage and swallows clicks, so the window is modal.

### Controls window (`WindowControls_Setup`)

* `mcPlayer1` and `mcPlayer2` show the bound key names in `tb<Shoot|MoveUp|...>` from the
  `CInput.mValidKeys` table (`validKeys.ts`, names in `en.json` `key.name.<code>`).
* In Single, `mc2PlayerCover` covers player 2 and blocks its buttons, as in the original.
* Clicking `mcChangeKey_<name>` (`Click2`) shows `mcPressKey` (its own `mcLock` blocks the
  pointer) with the blinking "PRESS A KEY" clip. The next key (`KeyCapture`):
  * Escape (27) cancels;
  * a key in the table with `mValid` stores the code in `settings.keys` and persists it;
  * a key in the table with `mValid = false` (`;`, backquote, `#`, `[`, `]`, `-zero-`) is
    ignored;
  * any other key (digits, P, Enter, modifiers, F-keys) shows "INVALID KEY!" for 500 ms,
    then cross-fades back to "PRESS A KEY" over 500 ms.
* Reset applies `ResetControls` (arrows, `/`, `.`, `,` and W, S, A, D, space, E, Q).
* Duplicate bindings are allowed, as in the original.
* Browser key codes are mapped back to legacy codes with `keyCodeForCode`, the inverse of
  `codeForKeyCode`.
* Kept quirk: `Setup_ValidKeys` writes Caps Lock, Num Lock and Scroll Lock before it
  creates the array, so those entries are lost and the keys count as invalid. The
  backslash entry's name is `''` in the decompiled table and is kept.

## Transitions (`CScreen_Transition`)

Each menu screen snapshots the visible canvas (the previous screen's last frame, or the
black boot canvas) when it is created. For 10 screen-logic steps the old frame is drawn
at `1 - k / 10` and the new screen at `k / 10` alpha over black; the screen ignores the
pointer until the fade is done, as an invisible Flash clip does. The original's default
`DropShadowFilter` on the incoming 640 x 480 bitmap falls entirely outside the stage and
is not drawn. `GameScreen` starts without a transition because `Screen_LoadingWorld`
is not ported.

## Rendering

The menus draw through `LayeredStage`: the root display list is split into layers (one per
top-level item, after expanding plain containers such as `_SubScreen_Container`,
`mcLevel_Selection` and the windows), each rendered once into a stage-space bitmap keyed
by its overrides. A hover change or a blinking clip only re-renders its own layer, and
an unchanged frame is not recomposed. Hit testing (`instanceHitArea`) resolves an
instance path through the same composed tree (replacements, attachments, overrides) and
tests the point against the button's `hitTest` bounds or the clip's bounds in local
space, so rotated and scaled clips are handled.

### Visual gaps

* Bevel filters are not drawn. They are on the level preview and character card frames
  (`_Shadow`, `mcCharacter`); the drop shadows on the same clips are drawn, so the cards
  read correctly but lack the light top-left edge.
* Text uses the extracted static-text SVGs and the embedded fonts, so labels match; edit
  texts (key names) use the WOFF font with the renderer's approximate layout.
