# ADR 0005: Online multiplayer with an authoritative server, no local two-player mode

Status: accepted

## Context

The original *Boxhead: 2Play Rooms* is a local two-player game: both players share one
keyboard, coop shares one camera (the average of both players), and deathmatch splits the
stage into two scaled 480 x 480 views. The owner asked for multiplayer over the network,
modeled on `~/Projects/tanka-maze` (a Node WebSocket server that owns the simulation,
lobbies that players create and join, a single port in production), and for local
two-player play to be removed.

The domain is already deterministic and pure (ADR 0001): `World.update(TickInput)` with
an injected `Rng`, and rendering only reads plain-data visual descriptors.

Options:

1. **Lockstep.** Every client runs the same `World` and only inputs travel. Lowest
   bandwidth, but any float or ordering difference between browsers desyncs the game,
   a slow client stalls everyone, and late joining needs a full state transfer.
2. **Client-side prediction with server reconciliation.** Responsive, but the domain has
   no rollback, and AS2-style mutable things would need full snapshot and restore.
3. **Authoritative server, clients render server frames.** The server runs `World` at
   the game's tick rate and sends each player the draw list of that player's camera.
   Clients send key state. Simple, cheat resistant, late join is trivial. Costs one
   round trip of input latency and about 4 KB per frame (1 KB deflated).

## Decision

Option 3.

* `src/net/` holds the shared, pure protocol: Zod-validated JSON messages, control bit
  masks, and the server-side frame builder. It obeys the domain purity lint rules.
* `src/server/` holds the server. `Hub` (sessions, rate limiting, lobby routing), `Lobby`
  (members, host, match lifecycle) and `Match` (one `World`, per-player `RemoteControls`)
  depend only on ports (`Connection`, `Ticker`, `Timers`, `Clock`), so they are tested with
  in-memory fakes. `src/server/node/` adapts them to `ws`, `node:http` and Node timers.
* The domain supports up to `MAX_PLAYERS` (4) players with one camera each, late join
  (`World.joinPlayer`) and leave (`World.leavePlayer`), and credits deathmatch frags to
  the last attacking player.
* The browser keeps single play fully local (`GameScreen`, `GameSession`). Coop and
  deathmatch go through `LobbyScreen` and `OnlineGameScreen` (`OnlineClient`,
  `OnlineGameSession`), which play server frames through a small jitter buffer.
* Everything about local two players is removed: the second key set, the second
  character slot, split screen, the switch-sides button and the coop leash.

## Consequences

* Input latency is one round trip. On a LAN or a nearby server it is below one tick
  (40 ms). There is no prediction.
* The server needs the extracted assets (`rooms`, `characters/animMeta.json`, the symbol
  catalog) to build worlds; it loads them from `BOXHEAD_ASSET_DIR`.
* Bandwidth is about 25 frames per second per player. Frames are JSON with fractions
  rounded to three digits and permessage-deflate on the socket. A binary codec (like
  tanka-maze's `wire/`) is the next step if bandwidth matters.
* Settings move to version 2 (one character, one key set, a player name). Version 1 is
  migrated.
