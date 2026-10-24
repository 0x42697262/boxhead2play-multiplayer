# Online multiplayer

Decision: [ADR 0005](../adr/0005-authoritative-online-server.md). Port: `src/net/`
(shared protocol), `src/server/` (server), `src/adapters/net/ServerConnection.ts`,
`src/services/online/`, `src/ui/screens/online/`.

## Running

| Where | How | Socket |
|---|---|---|
| Development | `npm run dev`. The Vite plugin `tools/dev/onlineServerPlugin.ts` attaches the game server to Vite's HTTP server and loads assets from `public/assets/`. | `ws://<page host>/ws` |
| Production | `npm run build`, then `npm start`. `dist-server/main.js` serves `dist/` and the socket on one port. | `ws(s)://<page host>/ws` |

Server environment (validated in `src/config/serverEnv.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `BOXHEAD_STATIC_DIR` | `dist` | Built client to serve |
| `BOXHEAD_ASSET_DIR` | `dist/assets` | Extracted assets the server loads |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `BOXHEAD_MONITOR_TOKEN` | unset | At least 16 characters. Turns on `/__monitor` for `npm run monitor -- --token` (see `docs/runtime/monitor.md`) |

The client connects to the page's own host unless `VITE_SERVER_URL` (`ws://` or `wss://`)
is set at build time.

## Flow

```
main menu -> COOPERATIVE / DEATH MATCH -> online menu (HOST, JOIN)
online menu -> HOST -> lobby room (OBJECTIVE screen) -> click the level -> online game
online menu -> JOIN -> join window -> JOIN on a row -> lobby room (or straight into a running match)
online game -> lobby room (with the result)
```

Every online screen is drawn from the SWF's own symbols, like the menus
(`docs/runtime/screens.md`); there is no HTML UI.

* **Online menu** (`OnlineMenuScreen`). The main menu backdrop and title with two
  button slots of the main menu: HOST (`mcSinglePlay`) and JOIN (`mcCoopPlay`), with the
  same roll-over. The labels are the edit text
  536 (Arial Rounded MT Bold, the face of the main menu labels), since the static
  labels have glyphs for their own words only. The select-world back tab returns to the
  main menu. A status line shows the connection, the number of open games, or the last
  notice. The screen connects and sends `watchLobbies(mode)`.
* **Name.** NAME: ... sits in the bottom-left corner of the main menu (`NAME_BUTTON`
  `mcName`, a half-size clone of the SETTINGS button with a left-aligned label wide enough
  for 16 characters), mirroring JOIN BY CODE in the bottom-right corner. Clicking it edits
  the name in place: typed characters, Backspace, Enter saves to the settings, Escape
  cancels, a blinking `_` caret. Clicking anything else saves too. The main menu is
  offline, so the name reaches the server with the next `hello`; the lobby and game
  screens keep no rename button.
* **Host.** HOST creates a game at once with the level last chosen for the mode and the
  OPTIONS values, then opens the lobby room.
* **Join window.** JOIN opens the CONTROLS window (`mcWindow_Controls`) as a list: "SELECT A
  GAME TO JOIN!", the 7 key rows of both player panels as 14 game slots. The row label
  shows `<GAME NAME>` and the key cell `JOIN n/max`, `FULL n/max` or `JOINING…`;
  clicking the key cell joins. More than 14 games are split into pages: two clones of the
  hidden RESET button (`< PREV`, `NEXT >`, 85 px left and right of the centered CLOSE) step
  through them, faded at the first and last page, and the info line says "Page n of m". The
  server allows up to 256 lobbies (`MAX_LOBBIES`).
* **Lobby codes.** Every lobby gets a 5 character code from `A-Z` and `2-9` without `I`, `L`,
  `O` (`lobbyCodeFromNumber(newSeed() + attempt)`, the first free one). The lobby room shows
  "CODE XXXXX · CLICK TO COPY LINK" right-aligned in the top-right corner, across from the
  "Back to menu" tab (`ROOM_INVITE`). The corner is empty in every mode, so the player list
  keeps its own column with 12 member lines (`ROOM_MEMBER_LINES`).
* **Joining by code.** The only place to type a code is JOIN BY CODE at the bottom right of
  the main menu (a scaled copy of the SETTINGS button, `JOIN_CODE_BUTTON`). Typing goes
  through `normalizeLobbyCode` (upper case, other characters dropped); Enter or a second
  click calls `FlowControls.joinByCode`, which opens the online menu (`CODE_JOIN_MENU_MODE`,
  coop) with `entry.joinCode`. The menu sends `joinByCode` and enters the lobby room of the
  joined lobby's mode. An unknown code leaves the player in the online menu with
  `codeNotFound` ("No game has that code.").
* **Game links.** `LobbyInvite.syncAddress` writes `?code=XXXXX` into the address bar
  (`history.replaceState`) whenever the client's lobby code changes, and removes it after
  leaving. On boot, `BrowserLobbyLink.initialCode` reads the parameter and `main.ts` calls
  `flow.joinByCode`, so opening a pasted link lands in the lobby. The link is copied by
  clicking the code line in the lobby room or COPY LINK (the `mcSinglePlay` slot) in the
  in-game Esc menu. `navigator.clipboard` exists only on secure origins (https, localhost),
  so on a LAN address `BrowserLobbyLink` falls back to a hidden text field and the copy
  command. Joining a running game also asks to enter the match
  (`OnlineClient.joinLobby(..., enterMatch)`), so the player goes straight into it.
* **Lobby room** (`SelectWorldScreen` with a `LobbyRoom`). The OBJECTIVE screen of the mode
  with the player list under the character card and the options summary under the level.
  The host keeps the level arrows and OPTIONS; each change reconfigures the game
  (`configureLobby`). Clicking the level preview ("CLICK TO START GAME") starts the match.
  Guests see the host's level and "WAITING FOR <HOST> TO START". The character arrows
  send `setCharacter`. The room texts are attached inside `_SubScreen_Container`, so the OPTIONS
  and CONTROLS windows draw over them. "Back to menu" leaves the game and returns to the online menu.
* **Start.** Only the host starts. Every connected member becomes a player, in member
  order (player index 0 is the host).
* **Late join.** A member who is not in the running match sees CLICK TO JOIN GAME. The server
  spawns a new player with `World.joinPlayer` near a living player (or the nearest open
  cell). In coop the new player gets every weapon unlocked so far; in deathmatch it
  starts with empty weapons and the pistol, like a respawn.
* **Leave.** QUIT? on the upgrade list (TAB) sends `leaveGame` and returns to the lobby room.
  "Back to menu" leaves the lobby (no notice for a leave the player asked for). The host
  role moves to the next connected member. An empty lobby
  closes. A match with no players left ends (`abandoned`).
* **Game over.** `World.completion` (all coop players dead, a deathmatch player reaching
  the kill target) sends `gameOver` with the state, the winner's name and the score, and
  the lobby returns to waiting. The lobby room shows the result at the bottom. A player
  who lost the lobby (closed, expired) lands in the online menu with the reason.

## Protocol (`src/net/protocol.ts`, version 3)

Client messages are JSON text. Server messages are binary delta frames
(`src/net/wire.ts`, ADR 0007): one `WireEncoder` per socket on the server, one
`WireDecoder` per socket on the client, each message a delta against the previous message
of the same type. Both sides validate the decoded values with Zod. Anything that fails is
dropped (client) or answered with `error: badMessage` (server). `npm run bandwidth`
measures the bytes per player for JSON, JSON + deflate, wire and wire + deflate and checks
that every decoded frame equals the JSON one.

| Client -> server | Purpose |
|---|---|
| `hello {version, sessionId, name}` | First message. A known `sessionId` resumes the session. |
| `setName`, `setCharacter` | Profile changes, also while in a lobby |
| `watchLobbies {mode}` | Subscribe to the lobby list of a mode |
| `createLobby`, `joinLobby`, `leaveLobby`, `configureLobby` | Lobby management |
| `joinByCode` | Join the lobby with that code (`codeNotFound` otherwise). |
| `startGame` | Host: start the match. Member outside a running match: join it. |
| `leaveGame` | Leave the running match, stay in the lobby |
| `input {down, pressed, released}` | Control bit masks (`src/net/controlMask.ts`) |

| Server -> client | Purpose |
|---|---|
| `welcome {clientId, sessionId, resumed}` | Session established |
| `lobbies`, `lobby`, `lobbyLeft {reason}` | Lobby list and state |
| `gameStarted {matchId, mode, roomId, options, playerIndex, ticksPerSecond, projectionFactor}` | Open the online game screen |
| `frame {tick, brightness, camera, entries, hud, events}` | One world tick for one player |
| `upgrades` | The multiplier upgrade list (sent when it changes, shown with TAB) |
| `gameOver {matchId, state, winnerName, score}` | Match result |
| `error {reason}` | A request failed (`ErrorReason`) |

Fractions on the wire are rounded to three digits. Text travels as text keys from
`en.json`, which the receiver checks with `isTextKey`.

## Input

The client samples its keyboard on every animation frame (`OnlineGameScreen.present`,
usually 60/s) with the normal `TickInputSampler`, turns the player's `PlayerInput` into
three bit masks (held, pressed since the last sample, released since the last sample)
and sends them only when the held set changes or an edge happened. Sampling per frame
instead of per 40 ms tick cuts up to 32 ms of input delay.
`RemoteControls` on the server accumulates edges between ticks and rebuilds
`PlayerInput` (with `heldTicks`) once per tick, so a tap between two ticks still arrives
as press plus release, like the local sampler. A disconnect releases all held controls.

## Frames and playback

Each tick the server drains the world's events once and builds one frame per player
(`src/net/frames.ts`): the player's camera, `drawList(camera)`, the HUD state (score,
multiplier, frags and deaths, the player's messages, every player's label data) and the events the
client needs: sounds, decals and score popups (screen position recomputed for that
player's camera). Shake is part of `camera.drawOrigin`.

`OnlineGameSession` plays frames at the server's tick rate through an adaptive
`FrameBuffer` (constants in `src/services/online/tuning.ts`). Every queued frame is
40 ms of delay between a key press and seeing it, so the buffer stays as short as the
connection allows:

* The target starts at 1 frame: a frame plays on the first client tick after it arrives.
* An underrun (no frame when one is due) waits for the target again and raises it by 1,
  up to 3. After 750 ticks (30 s) without an underrun the target drops by 1.
* Surplus frames are caught up: with 2 or more frames over the target, or 1 frame over
  for 13 ticks in a row, the session applies one extra frame per tick without drawing it
  (its sounds, popups and decals still play). Without this, any stall (a background tab,
  a slow first render, a GC pause) would keep the extra frames, and their delay, for the
  rest of the match.
* Beyond `MAX_BUFFERED_FRAMES` (6) the oldest frames are dropped. Their decals are still
  stamped, so blood and scorch marks are never lost; their sounds and popups are skipped.
* Ambience runs locally from the number of zombies in the frame.
* `OnlineClient` keeps the match's last `upgrades` message and hands it to the session
  when it attaches. A background tab creates the game screen only on its next animation
  frame, so the list sent with `gameStarted` would otherwise be lost.

## Upgrade list

There is no pause. TAB shows or hides the upgrade list and QUIT? over the running game; the
player keeps moving and firing, and a new `upgrades` message refreshes the shown list.
Hiding the tab sends released controls so the player stops walking.

## Reconnect

`ServerConnection` reconnects every 1.5 s after a drop. The client keeps its `sessionId`
in `sessionStorage`; `hello` with it resumes the same client within the server's grace
period (45 s): the lobby membership and the match player stay, and the server resends
`lobby` and `gameStarted`. After the grace period the member is removed from the lobby
and the match. A `welcome` with `resumed: false` ends a running online game.

## Limits

| Limit | Value | Where |
|---|---|---|
| Players per lobby and per match | 16 | `MAX_LOBBY_PLAYERS`, `MAX_PLAYERS` |
| Lobbies | 32 | `MAX_LOBBIES` |
| Clients | 256 | `MAX_CLIENTS` |
| Message size | 4096 bytes | `MAX_MESSAGE_BYTES` (also the socket `maxPayload`) |
| Message rate | 120/s, burst 240 | `MESSAGE_RATE_PER_SECOND`, `MESSAGE_BURST` |
| Name length | 16 (control characters removed, empty becomes "Player") | `PLAYER_NAME_MAX_LENGTH`, `sanitizeName` |
| Duplicate names | A name another connected player uses (ignoring case) gets " #2", " #3", … (cut to fit 16) | `uniqueName`, `DUPLICATE_NAME_MARK` |
| Catch-up ticks per timer callback | 5 | `MAX_CATCH_UP_TICKS` |

A match that throws while stepping ends with `error`, logged as `server.failed`.
