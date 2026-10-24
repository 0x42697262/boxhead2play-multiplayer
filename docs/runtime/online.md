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
* **One request at a time.** From HOST, JOIN on a row or a join code until the `lobby`
  reply (or an `error`), the online menu ignores further HOST and JOIN clicks, so a double
  click cannot create two games. Closing the join window does not cancel a pending join:
  the server may already have added the player, so the menu still enters the lobby room
  when the reply arrives. A `lobby` message for the lobby the player is just leaving
  ("Back to menu", then HOST at once) does not count as the reply.
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
  The host keeps the level arrows and OPTIONS while the lobby waits for players; each change
  reconfigures the game (`configureLobby`). The room always shows the lobby's level and
  options (`RoomPanel.levelIndex`, `lobbyOptions`), not the saved ones, so a player who
  becomes host after the previous host left starts from what the lobby has. A change sends
  the lobby's options with only the changed value and also saves that value locally for
  the next HOST. While a match runs (`RoomPanel.configurable` false) the arrows and OPTIONS
  are hidden and changes are ignored, so the saved settings do not drift from a request the
  server would refuse (`alreadyPlaying`). Clicking the level preview ("CLICK TO START GAME") starts the match.
  Guests see the host's level and "WAITING FOR <HOST> TO START". The character arrows
  send `setCharacter`. The room texts are attached inside `_SubScreen_Container`, so the OPTIONS
  and CONTROLS windows draw over them. "Back to menu" leaves the game and returns to the online menu.
* **Start.** Only the host starts. Every connected member becomes a player, in member
  order (player index 0 is the host).
* **Late join.** A member who is not in the running match sees CLICK TO JOIN GAME. The server
  spawns a new player with `World.joinPlayer` near a living player (or the nearest open
  cell). In coop the new player gets every weapon unlocked so far; in deathmatch it
  starts with empty weapons and the pistol, like a respawn.
* **Failed start.** If the online game screen cannot be built (for example a room the
  client's assets do not have), `ScreenFlow` sends `leaveGame` so no idle player stays in
  the match and opens the lobby room with "The match could not start in this browser."
* **Leave.** QUIT? on the upgrade list (`` ` ``) sends `leaveGame` and returns to the lobby room.
  "Back to menu" leaves the lobby (no notice for a leave the player asked for). The host
  role moves to the next connected member. An empty lobby
  closes. A match with no players left ends (`abandoned`).
* **Game over.** `World.completion` (all coop players dead, a deathmatch player reaching
  the kill target) sends `gameOver` with the state, the winner's name and the score, and
  the lobby returns to waiting. The lobby room shows the result at the bottom. A player
  who lost the lobby (closed, expired) lands in the online menu with the reason.

## Protocol (`src/net/protocol.ts`, version 6)

Client messages are JSON text. Server messages are binary delta frames
(`src/net/wire.ts`, ADR 0007): one `WireEncoder` per socket on the server, one
`WireDecoder` per socket on the client, each message a delta against the previous message
of the same type. Both sides validate the decoded values with Zod. Anything that fails is
dropped (client) or answered with `error: badMessage` (server). `npm run bandwidth`
measures the bytes per player for JSON, JSON + deflate, wire and wire + deflate and checks
that every decoded frame equals the JSON one.

Every change to a message schema, including a new enum value such as a HUD message tone
or a text key a frame may carry, bumps `PROTOCOL_VERSION` (`src/net/tuning.ts`). Version 5
added the `joined` message tone (`hud.joined`) and the `serverFull` error. Version 6 added
`latencyMs` to `ping` and the `latencies` message for the player list.

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
| `ping {id, latencyMs}` | Latency probe, once per second during a match; `latencyMs` is the client's own smoothed round trip (or `null` before the first pong), kept on the session for the player list |

| Server -> client | Purpose |
|---|---|
| `welcome {clientId, sessionId, resumed}` | Session established |
| `lobbies`, `lobby`, `lobbyLeft {reason}` | Lobby list and state |
| `gameStarted {matchId, mode, roomId, options, playerIndex, ticksPerSecond, projectionFactor}` | Open the online game screen |
| `frame {tick, brightness, camera, entries, hud, events}` | One world tick for one player |
| `upgrades` | The multiplier upgrade list (sent when it changes, shown with `` ` ``) |
| `gameOver {matchId, state, winnerName, score}` | Match result |
| `error {reason}` | A request failed (`ErrorReason`) |
| `pong {id}` | Echo of a `ping` |
| `latencies {latencies: [{playerIndex, latencyMs}]}` | Every match player's reported round trip, once per second (`LATENCY_REPORT_SECONDS`); `null` while offline or unknown |

The `Hub` keeps the last listed summary of every lobby. A lobby change sends `lobbies` to
the clients watching that mode only when one of the listed fields (name, room, state,
player count) changed, and builds that list once for all of them. A `setName` with the
same name, a `configureLobby` with the same room and options, or a character change does
not touch the lobby list; the last one still sends `lobby` to the members. Watcher
broadcasts are not batched over time: each listed change goes out at once, so the join
list stays exact for the JOIN button.

Fractions on the wire are rounded to three digits. Text travels as text keys from
`en.json`, which the receiver checks with `isTextKey`.

## Ping display

During a match `OnlineGameSession` calls `OnlineClient.ping()` on the first tick and then
once per second of ticks (`PINGS_PER_SECOND`). `LatencyMeter` remembers the local send
time per ping id. The id, not a timestamp, travels: the wire rounds fractions to three
digits, so an echoed `performance.now()` would no longer match. A `pong` gives the round
trip, smoothed with `LATENCY_SMOOTHING` (0.3) after the first sample. While a ping is still
unanswered, the shown value is at least the time it has been waiting, so a stalled
connection climbs into red instead of freezing at its last good value. A closed socket
resets the meter.

With `showPing` on (SETTINGS, default on), the HUD draws "`<n>` ms" right-aligned in the
top-right corner (`PING_POSITION`, 10 px, the player name text with its outline), in green
up to 60 ms, yellow up to 120 ms, orange up to 200 ms and red above (`PING_COLORS`).
Nothing is shown before the first pong or in single play. The value is the round trip
to the game server, not the delay between players.

## Player list (hold TAB)

Holding TAB or the touch players button shows a list of everyone in the match over the game; releasing hides it. It covers
the center top only (300 x up to 340 stage px below the score), so the game stays visible
around it, and fits all 16 players.

| Column | Source |
|---|---|
| Dot and status | `PlayerPresence`: offline when the lobby member is disconnected (reconnect grace), dead while the frame's `respawnTicks` is set ("Respawn in 7s", rounded up), otherwise alive |
| Name with a thin life bar | lobby member name; `lifeRatio` from the latest live frame |
| Latency | own: `OnlineClient.latencyMs()`; others: the server's `latencies` message, which repeats what each client reported in its `ping`. Colored like the HUD ping (`pingColor`) |
| Header | "PLAYERS", `<count> / <lobby maxPlayers>` |

`playerListView` (`src/services/online/playerList.ts`) builds the rows, pure and tested.
By owner request TAB holds the player list and `` ` `` (backquote, the tilde key) toggles
the upgrade list; until then it was the other way around.
`OnlineGameScreen.playerList` feeds it the lobby, the session's latest `hud.players` and
the latencies; `main.ts` checks the held keys (`PLAYER_LIST_CODES`) once per animation frame
and hands the view to `PlayerListOverlay` (`src/ui/hud/`), which rebuilds its DOM only when
the view changes.

The panel is DOM, not canvas, so text stays sharp at any scale. It uses the game's own
fonts (Calibri Bold, SWF font 25, the HUD message font, for the title and names; Calibri,
font 23, for the rest) with Apple-style material: a dark translucent rounded card, hairline
separators, system green/red/gray status dots, tabular digits, and the local player's row
tinted. Sizes are stage pixels through container query units (`--u = 100cqw / 640` on
`.shell`), so it scales with the stage. No backdrop blur, for the same frame-rate reason
as the touch controls. Reduced motion drops the pop-in; reduced transparency or more
contrast makes the card opaque. Single play has no list.

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
player's camera). Shake is part of `camera.drawOrigin`, and `brightness` is that player's
camera flash: each camera has its own shake and brightness, set only by explosions that
camera can see (`docs/domain/world-lifecycle.md`).

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
* Ambience runs locally from the number of zombies in the frame. The server's `World` skips
  it (`presentAmbience` off in `SERVER_SIMULATION_HOST`), so it does not walk every camera's
  draw order each tick just to count zombies.
* `OnlineClient` keeps the match's last `upgrades` message and hands it to the session
  when it attaches. A background tab creates the game screen only on its next animation
  frame, so the list sent with `gameStarted` would otherwise be lost.

## Upgrade list

There is no pause. `` ` `` shows or hides the upgrade list and QUIT? over the running game; the
player keeps moving and firing, and a new `upgrades` message refreshes the shown list.
Hiding the tab sends released controls so the player stops walking.

## Reconnect

`ServerConnection` reconnects after a drop with exponential backoff: 1.5 s, doubling up to
30 s, each delay shortened by a random part of up to half (`src/adapters/net/tuning.ts`; the
random source is a constructor argument so tests are deterministic). The jitter spreads out
the reconnects of many tabs after a server restart. A `welcome` resets the backoff. A
`versionMismatch` error is final: `OnlineClient` disconnects the transport, goes offline and
shows "Reload the page" instead of retrying. A full server (`MAX_CLIENTS`) answers a new
client with `serverFull` and closes; the client keeps retrying with backoff and clears the
notice on the next `welcome`.

A message that the `WireDecoder` cannot decode (any exception, not only `WireError`) means
the client's delta baselines may no longer match the server's encoder. The client closes
the socket and ignores the rest of its messages; the reconnect opens a new socket with a
fresh encoder and decoder on both sides and resumes the session. A message that decodes but
fails the Zod schema leaves the baselines intact and is only dropped.

The client keeps its `sessionId`
in `sessionStorage`; `hello` with it resumes the same client within the server's grace
period (45 s): the lobby membership and the match player stay, and the server resends
`lobby` and `gameStarted`. After the grace period the member is removed from the lobby
and the match. A `welcome` with `resumed: false` ends a running online game.

## Limits

| Limit | Value | Where |
|---|---|---|
| Players per lobby and per match | 16 | `MAX_LOBBY_PLAYERS`, `MAX_PLAYERS` |
| Lobbies | 256 | `MAX_LOBBIES` |
| Clients | 256 | `MAX_CLIENTS` |
| Message size | 4096 bytes | `MAX_MESSAGE_BYTES` (also the socket `maxPayload`) |
| Message rate | 120/s, burst 240 | `MESSAGE_RATE_PER_SECOND`, `MESSAGE_BURST` |
| Name length | 16 (control characters removed, empty becomes "Player") | `PLAYER_NAME_MAX_LENGTH`, `sanitizeName` |
| Duplicate names | A name another connected player uses (ignoring case) gets " #2", " #3", … (cut to fit 16) | `uniqueName`, `DUPLICATE_NAME_MARK` |
| Catch-up ticks per timer callback | 5 | `MAX_CATCH_UP_TICKS` |

A match that throws while stepping ends with `error`, logged as `server.failed`.

The match timer (`fixedStepTicker` in `src/server/node/timing.ts`) runs at most
`MAX_CATCH_UP_TICKS` ticks per timer callback. When it is still more than that many periods
behind (a stall, a suspended host), it skips ahead to the clock instead of replaying the
backlog. A match that ends inside a catch-up burst stops at once: no further ticks, no new
timer, and `Lobby` ignores ticks for a match that is no longer its current one, so
`match.ended` and `gameOver` go out once.

Joining a full lobby answers `lobbyFull` and keeps the client in the lobby it was in.

The production server (`src/server/main.ts`) closes WebSocket upgrade requests for any path
other than `/ws` at once (`rejectForeignUpgrades`). The dev server leaves them alone, because
Vite's HMR socket upgrades on the same HTTP server.
