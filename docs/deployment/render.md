# Render.com and Docker

## Why Docker

`npm run build` runs `setup:assets` first, which extracts the game assets from
`boxhead2play.swf` with JPEXS FFDec. FFDec is a Java program. Render's native Node runtime
has no Java, so a plain "Node" web service fails at the extraction step. The `Dockerfile`
brings its own Java:

| Stage | Base | What it does |
|---|---|---|
| `build` | `node:24-bookworm-slim` + `openjdk-17-jre-headless` | `npm ci`; copy only the SWF, `tools/setup`, `tools/extract` and the four `src/` files they import, then `npm run setup:assets` (FFDec is downloaded and checked against `FFDEC_ARCHIVE_SHA256`, assets extracted); copy the rest, `npm run build` (assets already up to date, client and server built, files precompressed), then `npm prune --omit=dev` |
| runtime | `node:24-bookworm-slim` | Only `package.json`, the production `node_modules` (`ws`, `zod`), `dist/` and `dist-server/`. Runs as the `node` user. No Java, no FFDec. |

The separate asset layer keeps FFDec and the extracted assets in the Docker layer cache: a
change to game or server code reruns only `npm run build`. The layer is rebuilt when the
SWF, the extractor or one of its imports changes, the same inputs as the extract stamp.
`test/tools/dockerAssetLayer.test.ts` fails when the extractor starts importing a file the
Dockerfile does not copy before `RUN npm run setup:assets`; add a `COPY` line for it.

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

`BOXHEAD_TRUST_PROXY` is `true`: every request reaches the service through Render's proxy,
so the socket address is the proxy's and the client address is the last `X-Forwarded-For`
entry, which that proxy appends. The per-address limits (`BOXHEAD_MAX_SOCKETS_PER_ADDRESS`,
`BOXHEAD_MAX_SESSIONS_PER_ADDRESS`, `BOXHEAD_MAX_LOBBIES_PER_ADDRESS`, see
`docs/runtime/online.md`) keep their defaults; add them on the Environment page to change
them. Not yet checked on Render itself: if Render's chain ever appended an internal hop as the
last entry, every player would share one address and the eighth tab anywhere would get
"Too many game tabs are open on your network". Check it with the verification checklist line
in `AGENTS.md` after the first deploy.

The `Dockerfile` sets no proxy setting: a plain `docker run` without a proxy in front uses
the socket address, which is right there. Behind your own proxy, pass
`-e BOXHEAD_TRUST_PROXY=true`.

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
* 2026-10-24: after a change to `src/main.ts`, `docker build` reuses the cached
  `RUN npm run setup:assets` layer and the build step prints "Game assets are up to date."
