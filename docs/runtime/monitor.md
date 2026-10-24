# Server monitor

`npm run monitor` is a terminal view of a running game server, refreshed every second:
CPU, memory, event-loop delay, network rates, lobbies and every player's traffic.

```
npm run monitor                                   # dev server on http://localhost:5173
npm run monitor -- --url http://localhost:5199    # another port
npm run monitor -- --url https://game.example --token "$BOXHEAD_MONITOR_TOKEN"
npm run monitor -- --once                         # two samples, printed once (also when piped)
```

For a local production build on port 8080:

```
BOXHEAD_MONITOR_TOKEN=local-monitor-token npm start
npm run monitor -- --url http://localhost:8080 --token local-monitor-token
```

Without the token the production server answers `/__monitor` with 404, and the tool says so.
Pointing the tool at a server nobody plays on shows 0 lobbies and 0 players.

`q` or Ctrl+C quits. `BOXHEAD_MONITOR_URL` and `BOXHEAD_MONITOR_TOKEN` replace the flags.

## What it shows

| Row | Source | Meaning |
|---|---|---|
| CPU | `process.cpuUsage()` difference / wall time | Percent of one core used by the server process, like htop |
| MEM | `process.memoryUsage()`, `os.totalmem/freemem` | Process RSS (bar: share of system memory), V8 heap, system memory |
| LOOP | `monitorEventLoopDelay` (10 ms resolution, minus the resolution) | How late timers fired during the server's last full 1 s window (`EVENT_LOOP_WINDOW_MS`); ticks are late when this grows |
| NET | TCP `bytesWritten` / `bytesRead` of every socket, plus closed sockets | Real bytes on the wire after permessage-deflate, including WebSocket framing |
| Lobbies | `Lobby.monitorRow()` | Members, the smoothed time of one match tick (budget 40 ms at 25 ticks/s), how long the current match has run (MATCH) and how long the lobby exists (AGE) |
| Players | `Hub.monitorClients()` and the socket of each session | Activity (menu, lobby, playing, offline), lobby, time since the session started (ONLINE, kept across reconnects), upload/download rate and totals for the current socket |

Rates come from the difference between two samples. A reconnect resets a player's
counters; the tool then counts from zero instead of showing a negative rate.

The tool sends one request at a time: the next one starts an interval after the previous
one started, or right after it ended when it took longer (the request timeout, 2 s, is
longer than the 1 s interval). A sample whose server `timeMs` is not newer than the shown
one is dropped (`isNewerSample`), so a late answer never yields a negative or near-zero
time span and absurd rates.

## Endpoint and access

The server answers `GET /__monitor` (`MONITOR_PATH`) with a `MonitorSnapshot` JSON object
(`src/server/monitorProtocol.ts`, `formatVersion` 3; the tool refuses other versions).
Version 3 added `eventLoopDelayMs.windowMs`.

The server measures the event loop delay in fixed windows of its own and reports the last
finished one. Requests never reset the measurement, so several monitors watching the same
server see the same values. The histogram and its window timer exist only when the monitor
is on (`monitorEnabled`: a token is set, or loopback access in the dev server); otherwise
`createMonitor` returns a monitor that answers nothing.

* **Dev server** (`npm run dev`): answers requests from loopback addresses only, without a
  token (`devServer.ts`, Vite middleware in `tools/dev/onlineServerPlugin.ts`).
* **Production** (`npm start`): off unless `BOXHEAD_MONITOR_TOKEN` is set. Then every
  request needs `Authorization: Bearer <token>` (compared in constant time), from any
  address. Loopback alone is not trusted because a reverse proxy on the same host would
  make every visitor look local.

The tool uses only Node built-ins (`tools/monitor/main.ts` for fetching, keys and the
screen; `tools/monitor/view.ts` for the pure layout), so `node` runs it without a build.
