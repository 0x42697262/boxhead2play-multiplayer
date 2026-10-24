# Render.com and Docker

## Why Docker

`npm run build` runs `setup:assets` first, which extracts the game assets from
`boxhead2play.swf` with JPEXS FFDec. FFDec is a Java program. Render's native Node runtime
has no Java, so a plain "Node" web service fails at the extraction step. The `Dockerfile`
brings its own Java:

| Stage | Base | What it does |
|---|---|---|
| `build` | `node:24-bookworm-slim` + `openjdk-17-jre-headless` | `npm ci`, `npm run build` (FFDec is downloaded and checked against `FFDEC_ARCHIVE_SHA256`, assets extracted, client and server built, files precompressed), then `npm prune --omit=dev` |
| runtime | `node:24-bookworm-slim` | Only `package.json`, the production `node_modules` (`ws`, `zod`), `dist/` and `dist-server/`. Runs as the `node` user. No Java, no FFDec. |

`.dockerignore` keeps local `node_modules`, builds, extracted assets and `.cache/` out of the
build context, so the image always extracts from the tracked SWF.

## Blueprint

`render.yaml` defines one web service: `runtime: docker`, `plan: free`, health check `/`.
Render injects `PORT` (the server reads it, `HOST` is `0.0.0.0` in the image), terminates TLS
and forwards WebSocket upgrades, so the page's `wss://<host>/ws` works without settings.

`BOXHEAD_MONITOR_TOKEN` uses `generateValue: true`: Render creates a random value once.
Copy it from the service's Environment page, then:

```sh
npm run monitor -- --url https://<service>.onrender.com --token <value>
```

Delete the variable to turn `/__monitor` off.

## Free plan limits

* The service sleeps after about 15 minutes without HTTP traffic and takes about a minute to
  wake. Lobbies live in memory, so a sleep or a redeploy ends every running game.
* 512 MB of memory. The server uses about 90-120 MiB idle and with a two-player match.
* One instance only: lobbies are not shared between processes.

## Verified (2026-10-24, Docker 29.9)

* `docker build` finishes in about 2.5 minutes; the image is 366 MB.
* `docker run --memory 512m -e PORT=10000` logs `server.started` with 18 rooms on port
  10000. `/` and `/assets/manifest.json` answer 200, `/ws` answers `101 Switching Protocols`,
  `npm run monitor --token` reads the server, and a two-tab coop game runs. The container
  used 86 MiB.
* Not yet deployed on Render itself.
