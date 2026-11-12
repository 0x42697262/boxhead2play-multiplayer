# Boxhead: 2Play Rooms in the browser

A TypeScript port of the 2007 Flash game *Boxhead: 2Play Rooms* by Sean Cooper. The
simulation follows the original ActionScript; the art, rooms, characters, sounds and fonts
are extracted from the original SWF and rendered with canvas.

SINGLE PLAY runs in the browser. COOPERATIVE, DEATH MATCH and TEAM BATTLE are online:
up to 16 players HOST or JOIN a game, and a Node server runs the match. There is no local
two-player mode.

TEAM BATTLE has two teams of up to eight, permanent teammate protection and a five-minute
match clock. Most opponent kills wins; ties draw. Players can choose a team before entering,
and the host can independently enable neutral Zombies and Devils before starting.
See [Team Battle rules](docs/domain/team-battle.md).

## Quick start

Requirements: [Node.js](https://nodejs.org) 24 or newer and a Java runtime 8 or newer
(only used once, to extract the game assets).

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The dev server also runs the
game server, so COOPERATIVE, DEATH MATCH and TEAM BATTLE work right away: open the page in a second
tab (or on another machine with `npm run dev -- --host`), click HOST in one tab and JOIN
it in the other.

The first `npm run dev` extracts the game assets from `boxhead2play.swf` into
`public/assets/`. It downloads the pinned JPEXS FFDec 26.4.0 decompiler into `.cache/`
(about 22 MB, SHA-256 checked) and takes about 20 seconds. Later runs check a stamp and
skip extraction unless the SWF, the extractor code or the FFDec version changed. To use an
FFDec you already have, set `FFDEC_JAR=/path/to/ffdec.jar`.

## Controls

| Action | Keys |
|---|---|
| Move | W A S D |
| Fire | Space |
| Next / previous weapon | E / Q |
| Select weapon | 0 – 9 |
| Show upgrade list | `` ` `` (backquote, the tilde key) |
| Player list (online, hold) | TAB |

Keys can be rebound in CONTROLS on the level select screen.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Extract assets if needed, then start the dev server |
| `npm run build` | Extract assets if needed, typecheck, build the client into `dist/` and the server into `dist-server/` |
| `npm run build:dist` | The same build without the asset step and the typecheck (used by the Nix package) |
| `npm start` | Serve `dist/` and the game server on one port (`PORT`, default 8080) |
| `npm run preview` | Serve the `dist/` build without the game server |
| `npm run ci` | Lint, typecheck and test (zero warnings) |
| `npm run extract` | Force a fresh asset extraction |
| `npm run setup:assets` | Extract only if the assets are missing or out of date |

If you re-extract while `npm run dev` is running, restart the dev server: Vite does not
serve files added to `public/` after it started.

## Hosting online games

```sh
npm run build
PORT=8080 npm start
```

Players open `http://<your host>:8080`. Behind HTTPS, the page connects with `wss://` on
the same host. Server settings and the protocol are in `docs/runtime/online.md`.

The server sends precompressed (brotli or gzip) files and long-lived cache headers for
content-versioned assets: a first visit downloads about 2.6 MiB, later visits only
revalidate `index.html` and `manifest.json`. See `docs/runtime/http-caching.md`.

## Render.com and Docker

`render.yaml` deploys the `Dockerfile` as one free web service: push the repo, then in Render
**New > Blueprint** and pick the repository. Docker is required because the build extracts
the assets with FFDec, which needs Java, and Render's Node runtime has none. Details,
limits of the free plan and the monitor token are in `docs/deployment/render.md`.

```sh
docker build -t boxhead2play .
docker run -p 8080:8080 boxhead2play                 # then open http://localhost:8080
```

## Amazon ECS

The same image runs on ECS Fargate as one task with a `cloudflared` sidecar, so Cloudflare
serves HTTPS and WebSockets without a load balancer. `.github/workflows/ecs.yml` builds and
deploys on every push to `main` once the repository is configured. The AWS and Cloudflare
setup is in `docs/deployment/ecs.md`.

## Nix

The repository is a Nix flake with a package, a `nix run` app, a dev shell and a NixOS
module (`services.boxhead2play`).

```sh
nix run github:0x42697262/boxhead2play-multiplayer   # then open http://localhost:8080
nix develop                                         # Node 24 + Java + FFDec, then npm install && npm run dev
```

The package extracts the assets at build time with a Nix-fetched FFDec, so the result
needs no Java. Module options, the deployment example and the `npmDepsHash` update step are
in `docs/deployment/nix.md`.

## Documentation

Start with `docs/architecture.md` and `AGENTS.md` (working rules, confirmed facts and the
verification checklist). The asset pipeline is described in `docs/assets/pipeline.md`.
