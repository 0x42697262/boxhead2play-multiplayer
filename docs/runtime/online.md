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

The client connects to the page's own host unless `VITE_SERVER_URL` (`ws://` or `wss://`)
is set at build time.

## Flow

```
main menu -> COOPERATIVE / DEATH MATCH -> lobby (browse, host, join)
lobby -> HOST GAME / CHANGE LEVEL -> select world (mode) -> click level -> lobby
lobby (host) -> START GAME -> online game -> lobby (with the result)
```

* **Browse.** The lobby screen connects, sends `watchLobbies(mode)` and lists that mode's
  games (name, level, players, state). JOIN is disabled when a game is full.
* **Host.** HOST GAME opens the original select-world screen for the mode. Clicking a
  level returns to the lobby and creates a game with the level and the OPTIONS values
  (difficulty, speed, devils, collisions, damage, kills to win, detail). CHANGE LEVEL
  does the same for an existing game (`configureLobby`).
* **Start.** Only the host starts. Every connected member becomes a player, in member
  order (player index 0 is the host).
* **Late join.** A member who is not in the running match sees JOIN GAME. The server
  spawns a new player with `World.joinPlayer` near a living player (or the nearest open
  cell). In coop the new player gets every weapon unlocked so far; in deathmatch it
  starts with empty weapons and the pistol, like a respawn.
* **Leave.** QUIT? on the upgrade list (P) sends `leaveGame` and returns to the lobby. LEAVE
  leaves the lobby. The host role moves to the next connected member. An empty lobby
  closes. A match with no players left ends (`abandoned`).
* **Game over.** `World.completion` (all coop players dead, a deathmatch player reaching
  the kill target) sends `gameOver` with the state, the winner's name and the score, and
  the lobby returns to waiting.

## Protocol (`src/net/protocol.ts`, version 1)

JSON text messages, validated with Zod on both sides. Anything that fails validation is
dropped (client) or answered with `error: badMessage` (server).

| Client -> server | Purpose |
|---|---|
| `hello {version, sessionId, name}` | First message. A known `sessionId` resumes the session. |
| `setName`, `setCharacter` | Profile changes, also while in a lobby |
| `watchLobbies {mode}` | Subscribe to the lobby list of a mode |
| `createLobby`, `joinLobby`, `leaveLobby`, `configureLobby` | Lobby management |
| `startGame` | Host: start the match. Member outside a running match: join it. |
| `leaveGame` | Leave the running match, stay in the lobby |
| `input {down, pressed, released}` | Control bit masks (`src/net/controlMask.ts`) |

| Server -> client | Purpose |
|---|---|
| `welcome {clientId, sessionId, resumed}` | Session established |
| `lobbies`, `lobby`, `lobbyLeft {reason}` | Lobby list and state |
| `gameStarted {matchId, mode, roomId, options, playerIndex, ticksPerSecond, projectionFactor}` | Open the online game screen |
| `frame {tick, brightness, camera, entries, hud, events}` | One world tick for one player |
| `upgrades` | The multiplier upgrade list (sent when it changes, shown with P) |
| `gameOver {matchId, state, winnerName, score}` | Match result |
| `error {reason}` | A request failed (`ErrorReason`) |

Fractions on the wire are rounded to three digits. Text travels as text keys from
`en.json`, which the receiver checks with `isTextKey`.

## Input

The client samples its keyboard every tick with the normal `TickInputSampler`, turns the
player's `PlayerInput` into three bit masks (held, pressed since last tick, released
since last tick) and sends them only when the held set changes or an edge happened.
`RemoteControls` on the server accumulates edges between ticks and rebuilds
`PlayerInput` (with `heldTicks`) once per tick, so a tap between two ticks still arrives
as press plus release, like the local sampler. A disconnect releases all held controls.

## Frames and playback

Each tick the server drains the world's events once and builds one frame per player
(`src/net/frames.ts`): the player's camera, `drawList(camera)`, the HUD state (score,
multiplier, frags, the player's messages, every player's label data) and the events the
client needs: sounds, decals and score popups (screen position recomputed for that
player's camera). Shake is part of `camera.drawOrigin`.

`OnlineGameSession` plays frames at the server's tick rate:

* It starts after `JITTER_BUFFER_FRAMES` (2) frames are queued and plays one per tick.
* When more than `MAX_BUFFERED_FRAMES` (6) are queued, it drops the oldest but still
  stamps their decals, so blood and scorch marks are never lost. Sounds and popups of
  dropped frames are skipped.
* When the queue runs dry it waits for the buffer again.
* Ambience runs locally from the number of zombies in the frame.
* `OnlineClient` keeps the match's last `upgrades` message and hands it to the session
  when it attaches. A background tab creates the game screen only on its next animation
  frame, so the list sent with `gameStarted` would otherwise be lost.

## Upgrade list

There is no pause. P shows or hides the upgrade list and QUIT? over the running game; the
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
| Players per lobby and per match | 4 | `MAX_LOBBY_PLAYERS`, `MAX_PLAYERS` |
| Lobbies | 32 | `MAX_LOBBIES` |
| Clients | 256 | `MAX_CLIENTS` |
| Message size | 4096 bytes | `MAX_MESSAGE_BYTES` (also the socket `maxPayload`) |
| Message rate | 120/s, burst 240 | `MESSAGE_RATE_PER_SECOND`, `MESSAGE_BURST` |
| Name length | 16 (control characters removed, empty becomes "Player") | `PLAYER_NAME_MAX_LENGTH`, `sanitizeName` |
| Catch-up ticks per timer callback | 5 | `MAX_CATCH_UP_TICKS` |

A match that throws while stepping ends with `error`, logged as `server.failed`.
