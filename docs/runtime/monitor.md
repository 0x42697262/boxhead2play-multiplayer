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
| LOOP | `monitorEventLoopDelay` (10 ms resolution, minus the resolution) | How late timers fire since the last sample; ticks are late when this grows |
| NET | TCP `bytesWritten` / `bytesRead` of every socket, plus closed sockets | Real bytes on the wire after permessage-deflate, including WebSocket framing |
| Lobbies | `Lobby.monitorRow()` | Members and the smoothed time of one match tick (budget 40 ms at 25 ticks/s) |
| Players | `Hub.monitorClients()` and the socket of each session | Activity (menu, lobby, playing, offline), lobby, upload/download rate and totals for the current socket |

Rates come from the difference between two samples. A reconnect resets a player's
counters; the tool then counts from zero instead of showing a negative rate.

## Endpoint and access

The server answers `GET /__monitor` (`MONITOR_PATH`) with a `MonitorSnapshot` JSON object
(`src/server/monitorProtocol.ts`, `formatVersion` 1; the tool refuses other versions).

* **Dev server** (`npm run dev`): answers requests from loopback addresses only, without a
  token (`devServer.ts`, Vite middleware in `tools/dev/onlineServerPlugin.ts`).
* **Production** (`npm start`): off unless `BOXHEAD_MONITOR_TOKEN` is set. Then every
  request needs `Authorization: Bearer <token>` (compared in constant time), from any
  address. Loopback alone is not trusted because a reverse proxy on the same host would
  make every visitor look local.

The tool uses only Node built-ins (`tools/monitor/main.ts` for fetching, keys and the
screen; `tools/monitor/view.ts` for the pure layout), so `node` runs it without a build.
