# Menu screens

Source: `Screen/CScreen.as`, `CScreen_Main.as`, `CScreen_SelectWorld.as`,
`CScreen_Transition.as`, `CScreen_Collection.as`, `CMain.as` (`State_*`), `CInput.as`
(`Setup_ValidKeys`). Port: `src/ui/screens/menu/`, `src/services/ScreenFlow.ts`,
`src/services/menuSettings.ts`, `src/adapters/input/validKeys.ts`,
`src/adapters/render/menu/LayeredStage.ts`. The online lobby is described in
`docs/runtime/online.md`.

## Flow

```
boot -> main menu -> SINGLE PLAY -> select world (single) -> game -> select world (single)
                  -> COOPERATIVE / DEATH MATCH -> online menu (mode)
online menu -> HOST / JOIN -> lobby room (select world of the mode) -> level clicked -> online game
online game -> lobby room (same mode)
```

| Original state | Port |
|---|---|
| `State_Intro` (`Screen_Intro`, logo clips) | Not ported. Boot goes straight to the main menu. |
| `State_Main` (`Screen_Main`) | `MainMenuScreen` |
| `State_SelectWorld_Single/Coop/DeathMatch` | `SelectWorldScreen` with a `GameMode`. Single starts a local game; Coop and DeathMatch pick the level of an online game. |
| `State_LoadWorld`, `State_LoadingWorld` (`Screen_LoadingWorld`) | Not ported. `GameScreen` starts the world directly. |
| `State_RunWorld` | `GameScreen` / `GameSession` (single), `OnlineGameScreen` / `OnlineGameSession` (coop, deathmatch) |
| `State_Debrief`, `State_Debrief_Winner` | Not ported. A single game returns to select world (`mReturn_SelectWorld`); an online game returns to the lobby, which shows the result. |
| none | `OnlineMenuScreen` (HOST, JOIN with the join window, NAME) |

`ScreenFlow` keeps the mode to return to (`mReturn_SelectWorld`). A room that cannot be
created also returns there, like the original `error` completion. `CScreen.GoBack`
(`_Icon_Back.onPress`) requests the main menu in single and the online menu (after leaving
the game) in the lobby room.

## Main menu (`Screen_Main`)

Only these parts of sprite 253 are drawn:

* the background (depth 1, sprite 198) and the title (depth 82, sprite 10, the BOXHEAD 2PLAY
  logo with the characters, checked visually);
* **SINGLE PLAY** (`mcSinglePlay`, depth 8), **COOPERATIVE** (`mcCoopPlay`, depth 10) and
  **DEATH MATCH** (`mcDeathPlay`, depth 12) at their original positions and labels.
* **SETTINGS** in the `mcInstructions` slot (depth 14). The label is the attached edit text
  of the online menu (`menuButtonLabel.ts`), because the INSTRUCTIONS art has no other glyphs.

### SETTINGS window (`SetupWindow.ts`)

The select-world OPTIONS window (`mcWindow_Options`, sprite 358) with a SETTINGS title.
Only the background, `mcLock`, RESET and CLOSE keep their art; every other child is hidden.
Two rows use the positions of the first two OPTIONS rows:

| Row | Buttons (instances, moved to the row) | Setting |
|---|---|---|
| Graphics | SHARP, SMOOTH, PIXELATED (`_Level_Beginner`..`_Level_Expert`) | `graphics` (ADR 0006) |
| Sound volume | OFF, LOW, MEDIUM, FULL (`_Game1`..`_Game4`) | `soundVolume` 0, 25, 50, 100 |

Button labels are attached edit texts with the glow of the original static labels. A click
stores the value at once: the shell refits and the mixer changes its volume. RESET restores
SHARP and FULL. These are device settings, separate from the game OPTIONS of select world.

Removed: the INSTRUCTIONS link of `mcInstructions` (external URL), button 203 (a "view the trailer" YouTube link),
`_IconMoreGames`, `_STC` ("A SEAN COOPER GAME" link), the four game banners (depths 60,
66, 70, 75, all external links) and `_Size`.

COOPERATIVE and DEATH MATCH are online modes (ADR 0005): they open the online menu instead
of select world.

### Hover (`Register_Button`)

* `_Contents._alpha` is 50 normally and 100 while the pointer is over the button.
* While hovered, every frame sets
  `[DropShadowFilter(rng.next() * 3, rng.int(360)), BlurFilter(rng.next() * 2, rng.next() * 2)]`
  on `_Contents` with Flash defaults (black, alpha 1, blur 4 x 4, strength 1, quality 1).
  The random draws keep the original order (distance, angle, blur x, blur y) and use an
  injected `Rng` (`rollOver.ts`).
* As in Flash, the effect starts on the first frame after the roll-over (`onEnterFrame`).
* Release plays `Click` and opens select world in `Single`, or the online menu in `Coop` or
  `DeathMatch`.
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
| `_Icon_Back` | On press: `Click`, back to the main menu (single) or out of the game to the online menu (lobby room). |
| `mcPlayer1_Character.bLeft/bRight` | `mcGotoFrame(mcCharacter, -1/+1)` with wraparound over the 4 frames, `Click2`, stored in `settings.character`. `mcPlayer2_Character` and its "2" label (depth 37, addressed as `#37`) are hidden in every mode. |
| `mcLevel_Selection.bLeft/bRight` | Wraparound over the 18 `LevelIcons_Single` frames, `Click2`, stored per mode in `settings.levelIndex`. The counter ("9/18") and the name are static texts on each frame. |
| `_mcLevelIcons._Button` | `Click`, starts the room whose `iconFrame` is the shown frame (`ROOM_Single_<index + 1>`) in single, or hosts (or reconfigures) an online game with it. |
| `_Game_Options` | Opens `mcWindow_Options`. |
| `_Game_Controls` | Opens `mcWindow_Controls`. |

Buttons render their `over` and `down` records while hovered or pressed (Flash
`SimpleButton` states), and the cursor is a hand over anything with a handler, except the
`mcLock` blockers (`useHandCursor = false`).

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

* `mcPlayer1` shows the bound key names in `tb<Shoot|MoveUp|...>` from the
  `CInput.mValidKeys` table (`validKeys.ts`, names in `en.json` `key.name.<code>`).
* There is one key panel (ADR 0005): `mcPlayer1` is moved to the center (x -77.5). The
  second panel, `mc2PlayerCover`, both "PLAYER n CONTROLS:" headings and the "Additional
  Controls" line are hidden. Attached edit texts show "CONTROLS" above the panel and
  "Additional controls: 0-9 select weapons, TAB shows the upgrade list" below it.
* Space is named SPACE instead of the original `' '`.
* Clicking `mcChangeKey_<name>` (`Click2`) shows `mcPressKey` (its own `mcLock` blocks the
  pointer) with the blinking "PRESS A KEY" clip. The next key (`KeyCapture`):
  * Escape (27) cancels;
  * a key in the table with `mValid` stores the code in `settings.keys` and persists it;
  * a key in the table with `mValid = false` (`;`, backquote, `#`, `[`, `]`, `-zero-`) is
    ignored;
  * any other key (digits, P, Tab, Enter, modifiers, F-keys) shows "INVALID KEY!" for 500 ms,
    then cross-fades back to "PRESS A KEY" over 500 ms.
* Reset applies the port's default keys (W, S, A, D, Space, E, Q) instead of the original
  `ResetControls` keys (arrows, `/`, `.`, `,`).
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
is not ported. Online screens add text with attached edit-text items
(`src/ui/screens/online/stageText.ts`): an existing edit text (HUD message 35, upgrade row
24, frags name 58, winner name 536) scaled to the wanted size, with the `textBounds`
override widening its box so long text is not clipped by the layer bitmap.

## Rendering

The menus draw through `LayeredStage`: the root display list is split into layers (one per
top-level item, after expanding plain containers such as `_SubScreen_Container`,
`mcLevel_Selection` and the windows), each rendered once into a stage-space bitmap keyed
by its overrides. Overrides address children by instance name, or by depth as `#<depth>`
for unnamed items (`depthKey`). A hover change or a blinking clip only re-renders its own layer, and
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
